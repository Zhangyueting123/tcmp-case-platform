/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

interface Row { [key: string]: any }
interface Sheet {
  id: string;
  name: string;
  rows: Row[];
  /** key=`r:c` → userId */
  focus: Map<string, number>;
}
interface User { userId: number; username: string; sockets: Set<string> }
interface Doc {
  sheets: Sheet[];
  /** userId → User */
  users: Map<number, User>;
  /** color per user */
  colors: Map<number, string>;
  /** userId → 当前所在 sheetId */
  activeSheet: Map<number, string>;
}

/**
 * 多 sheet 单元格协作。范围：用例集 → 批量新增弹窗。
 * 房间 = `bulk:caseSet:<caseSetId>`。
 *
 * 客户端事件：
 *   bulk:join         { caseSetId } → server: bulk:state
 *   bulk:leave        { caseSetId }
 *   bulk:cell-change  { caseSetId, sheetId, r, c, key, value }
 *   bulk:row-op       { caseSetId, sheetId, op: 'add'|'remove', index, count? }
 *   bulk:focus        { caseSetId, sheetId, r, c }
 *   bulk:blur         { caseSetId }
 *   bulk:sheet-op     { caseSetId, op: 'add'|'remove'|'rename', sheetId?, name? }
 *   bulk:active-sheet { caseSetId, sheetId }   // 切换当前活动 sheet（用于在线列表显示）
 *
 * 服务端广播：
 *   bulk:state        { selfUserId, sheets, presence }
 *   bulk:cell-change  { sheetId, r, c, key, value, by }
 *   bulk:row-op       { sheetId, op, index, count, by }
 *   bulk:focus        { sheetId, r, c, userId, username, color }
 *   bulk:blur         { userId }
 *   bulk:sheet-op     { op, sheet?, sheetId?, name?, by }
 *   bulk:presence     { users: [{ userId, username, color, activeSheet }] }
 */
@WebSocketGateway({ cors: { origin: true, credentials: true }, namespace: '/collab' })
export class CollabGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('Collab');
  private docs = new Map<string, Doc>();
  private sessions = new Map<string, { roomKey: string; userId: number; username: string }>();
  private cleanupTimers = new Map<string, NodeJS.Timeout>();
  private sheetSeq = 0;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    let token = (client.handshake.auth?.token || client.handshake.query?.token) as string;
    if (typeof token === 'string' && token.startsWith('Bearer ')) token = token.slice(7);
    if (!token) {
      client.emit('bulk:error', { message: 'no token' });
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwt.verify(token) as any;
      (client as any).user = {
        userId: payload.sub,
        username: payload.username || payload.name || `用户${payload.sub}`,
      };
    } catch {
      client.emit('bulk:error', { message: 'invalid token' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const s = this.sessions.get(client.id);
    if (!s) return;
    this.sessions.delete(client.id);
    const doc = this.docs.get(s.roomKey);
    if (!doc) return;
    const u = doc.users.get(s.userId);
    if (u) {
      u.sockets.delete(client.id);
      if (!u.sockets.size) {
        doc.users.delete(s.userId);
        doc.activeSheet.delete(s.userId);
        // 释放该用户在所有 sheet 的焦点
        for (const sh of doc.sheets) {
          for (const [k, uid] of sh.focus) {
            if (uid === s.userId) sh.focus.delete(k);
          }
        }
        this.server.to(s.roomKey).emit('bulk:blur', { userId: s.userId });
        this.broadcastPresence(s.roomKey);
      }
    }
    if (!doc.users.size) {
      const t = setTimeout(() => {
        if (this.docs.has(s.roomKey) && !this.docs.get(s.roomKey).users.size) {
          this.docs.delete(s.roomKey);
        }
      }, 5 * 60 * 1000);
      this.cleanupTimers.set(s.roomKey, t);
    }
  }

  @SubscribeMessage('bulk:join')
  onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { caseSetId: number }) {
    const user = (client as any).user;
    if (!user) return { ok: false };
    const caseSetId = Number(body?.caseSetId);
    if (!caseSetId) return { ok: false };
    const roomKey = `bulk:caseSet:${caseSetId}`;
    if (this.cleanupTimers.has(roomKey)) {
      clearTimeout(this.cleanupTimers.get(roomKey));
      this.cleanupTimers.delete(roomKey);
    }
    let doc = this.docs.get(roomKey);
    if (!doc) {
      doc = {
        sheets: [this.newSheet('Sheet 1')],
        users: new Map(),
        colors: new Map(),
        activeSheet: new Map(),
      };
      this.docs.set(roomKey, doc);
    }
    let u = doc.users.get(user.userId);
    if (!u) {
      u = { userId: user.userId, username: user.username, sockets: new Set() };
      doc.users.set(user.userId, u);
    }
    u.sockets.add(client.id);
    if (!doc.colors.has(user.userId)) {
      doc.colors.set(user.userId, this.pickColor(doc.colors.size));
    }
    if (!doc.activeSheet.has(user.userId)) {
      doc.activeSheet.set(user.userId, doc.sheets[0].id);
    }
    this.sessions.set(client.id, { roomKey, userId: user.userId, username: user.username });
    client.join(roomKey);

    client.emit('bulk:state', {
      selfUserId: user.userId,
      sheets: doc.sheets.map((sh) => ({
        id: sh.id,
        name: sh.name,
        rows: sh.rows,
        focus: Array.from(sh.focus.entries()).map(([k, uid]) => {
          const [r, c] = k.split(':').map(Number);
          return { r, c, userId: uid };
        }),
      })),
      presence: this.presenceList(doc),
    });
    this.broadcastPresence(roomKey);
    return { ok: true };
  }

  @SubscribeMessage('bulk:leave')
  onLeave(@ConnectedSocket() client: Socket, @MessageBody() body: { caseSetId: number }) {
    this.handleDisconnect(client);
    client.leave(`bulk:caseSet:${body?.caseSetId}`);
  }

  @SubscribeMessage('bulk:cell-change')
  onCellChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { caseSetId: number; sheetId: string; r: number; c: number; key: string; value: any },
  ) {
    const s = this.sessions.get(client.id);
    if (!s) return;
    const doc = this.docs.get(s.roomKey);
    if (!doc) return;
    const sh = doc.sheets.find((x) => x.id === body.sheetId);
    if (!sh) return;
    const { r, c, key, value } = body;
    if (!sh.rows[r]) {
      while (sh.rows.length <= r) sh.rows.push(this.newRow());
    }
    sh.rows[r][key] = value;
    client.to(s.roomKey).emit('bulk:cell-change', { sheetId: sh.id, r, c, key, value, by: s.userId });
  }

  @SubscribeMessage('bulk:row-op')
  onRowOp(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { caseSetId: number; sheetId: string; op: 'add' | 'remove'; index?: number; count?: number },
  ) {
    const s = this.sessions.get(client.id);
    if (!s) return;
    const doc = this.docs.get(s.roomKey);
    if (!doc) return;
    const sh = doc.sheets.find((x) => x.id === body.sheetId);
    if (!sh) return;
    const { op } = body;
    const count = Math.max(1, Number(body.count || 1));
    if (op === 'add') {
      const idx = typeof body.index === 'number' ? Math.max(0, body.index) : sh.rows.length;
      const fresh = Array.from({ length: count }, () => this.newRow());
      sh.rows.splice(idx, 0, ...fresh);
      this.shiftFocus(sh, idx, count);
    } else if (op === 'remove') {
      const idx = Math.max(0, Number(body.index));
      sh.rows.splice(idx, count);
      this.shiftFocus(sh, idx, -count);
    }
    this.server.to(s.roomKey).emit('bulk:row-op', { sheetId: sh.id, op, index: body.index ?? null, count, by: s.userId });
  }

  @SubscribeMessage('bulk:focus')
  onFocus(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { caseSetId: number; sheetId: string; r: number; c: number },
  ) {
    const s = this.sessions.get(client.id);
    if (!s) return;
    const doc = this.docs.get(s.roomKey);
    if (!doc) return;
    const sh = doc.sheets.find((x) => x.id === body.sheetId);
    if (!sh) return;
    // 释放该 user 在所有 sheet 的焦点
    for (const x of doc.sheets) {
      for (const [k, uid] of x.focus) {
        if (uid === s.userId) x.focus.delete(k);
      }
    }
    sh.focus.set(`${body.r}:${body.c}`, s.userId);
    const color = doc.colors.get(s.userId) || '#409eff';
    this.server.to(s.roomKey).emit('bulk:focus', {
      sheetId: sh.id, r: body.r, c: body.c, userId: s.userId, username: s.username, color,
    });
  }

  @SubscribeMessage('bulk:blur')
  onBlur(@ConnectedSocket() client: Socket) {
    const s = this.sessions.get(client.id);
    if (!s) return;
    const doc = this.docs.get(s.roomKey);
    if (!doc) return;
    for (const sh of doc.sheets) {
      for (const [k, uid] of sh.focus) {
        if (uid === s.userId) sh.focus.delete(k);
      }
    }
    this.server.to(s.roomKey).emit('bulk:blur', { userId: s.userId });
  }

  @SubscribeMessage('bulk:active-sheet')
  onActiveSheet(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { caseSetId: number; sheetId: string },
  ) {
    const s = this.sessions.get(client.id);
    if (!s) return;
    const doc = this.docs.get(s.roomKey);
    if (!doc) return;
    if (!doc.sheets.some((x) => x.id === body.sheetId)) return;
    doc.activeSheet.set(s.userId, body.sheetId);
    this.broadcastPresence(s.roomKey);
  }

  @SubscribeMessage('bulk:sheet-op')
  onSheetOp(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { caseSetId: number; op: 'add' | 'remove' | 'rename'; sheetId?: string; name?: string },
  ) {
    const s = this.sessions.get(client.id);
    if (!s) return;
    const doc = this.docs.get(s.roomKey);
    if (!doc) return;
    if (body.op === 'add') {
      const name = (body.name || '').trim() || this.defaultSheetName(doc);
      const sh = this.newSheet(name);
      doc.sheets.push(sh);
      this.server.to(s.roomKey).emit('bulk:sheet-op', {
        op: 'add',
        sheet: { id: sh.id, name: sh.name, rows: sh.rows },
        by: s.userId,
      });
    } else if (body.op === 'remove') {
      if (doc.sheets.length <= 1) return; // 至少保留 1 个
      const idx = doc.sheets.findIndex((x) => x.id === body.sheetId);
      if (idx < 0) return;
      const removed = doc.sheets.splice(idx, 1)[0];
      // 将所有该 sheet 的活动用户切到第一个 sheet
      const fallback = doc.sheets[0].id;
      for (const [uid, sid] of doc.activeSheet) {
        if (sid === removed.id) doc.activeSheet.set(uid, fallback);
      }
      this.server.to(s.roomKey).emit('bulk:sheet-op', { op: 'remove', sheetId: removed.id, by: s.userId });
      this.broadcastPresence(s.roomKey);
    } else if (body.op === 'rename') {
      const sh = doc.sheets.find((x) => x.id === body.sheetId);
      if (!sh) return;
      const name = (body.name || '').trim();
      if (!name) return;
      sh.name = name.slice(0, 32);
      this.server.to(s.roomKey).emit('bulk:sheet-op', { op: 'rename', sheetId: sh.id, name: sh.name, by: s.userId });
    }
  }

  // ===== helpers =====

  private shiftFocus(sh: Sheet, fromRow: number, delta: number) {
    const next = new Map<string, number>();
    for (const [k, uid] of sh.focus) {
      const [r, c] = k.split(':').map(Number);
      if (r < fromRow) {
        next.set(k, uid);
      } else if (delta > 0) {
        next.set(`${r + delta}:${c}`, uid);
      } else {
        const removedEnd = fromRow + (-delta);
        if (r >= removedEnd) next.set(`${r + delta}:${c}`, uid);
      }
    }
    sh.focus = next;
  }

  private broadcastPresence(roomKey: string) {
    const doc = this.docs.get(roomKey);
    if (!doc) return;
    this.server.to(roomKey).emit('bulk:presence', { users: this.presenceList(doc) });
  }
  private presenceList(doc: Doc) {
    return Array.from(doc.users.values()).map((u) => ({
      userId: u.userId,
      username: u.username,
      color: doc.colors.get(u.userId) || '#409eff',
      activeSheet: doc.activeSheet.get(u.userId) || null,
    }));
  }

  private newSheet(name: string): Sheet {
    return {
      id: `sh_${Date.now().toString(36)}_${(++this.sheetSeq).toString(36)}`,
      name: name.slice(0, 32),
      rows: this.emptyRows(5),
      focus: new Map(),
    };
  }
  private defaultSheetName(doc: Doc): string {
    let i = doc.sheets.length + 1;
    const exists = new Set(doc.sheets.map((s) => s.name));
    while (exists.has(`Sheet ${i}`)) i++;
    return `Sheet ${i}`;
  }
  private emptyRows(n: number): Row[] {
    return Array.from({ length: n }, () => this.newRow());
  }
  private newRow(): Row {
    return {};
  }

  private pickColor(i: number): string {
    const palette = [
      '#409EFF', '#67C23A', '#E6A23C', '#F56C6C',
      '#9c27b0', '#26a69a', '#ec407a', '#7e57c2',
      '#5c6bc0', '#ff7043',
    ];
    return palette[i % palette.length];
  }
}
