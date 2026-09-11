/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public, CurrentUser } from '../../common/decorators';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

class SendCodeDto {
  @IsEmail() email: string;
}
class RegisterDto {
  @IsEmail() email: string;
  @IsString() @Length(8, 64) password: string;
  @IsString() @Length(1, 32) name: string;
  @IsString() @IsNotEmpty() @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' }) phone: string;
  @IsOptional() @IsString() code?: string;
}
class LoginDto {
  @IsEmail() email: string;
  @IsString() @IsNotEmpty() password: string;
}
class RefreshDto {
  @IsString() refreshToken: string;
}
class ForgotPasswordSendCodeDto {
  @IsEmail() email: string;
}
class ResetPasswordDto {
  @IsEmail() email: string;
  @IsString() @IsNotEmpty() code: string;
  @IsString() @Length(8, 64) newPassword: string;
}
class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 32) name?: string;
  @IsOptional() @IsString() @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' }) phone?: string;
  @IsOptional() @IsString() currentPassword?: string;
  @IsOptional() @IsString() @Length(8, 64) newPassword?: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  @Public()
  @Post('send-code')
  sendCode(@Body() dto: SendCodeDto) {
    return this.svc.sendCode(dto.email);
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.svc.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.svc.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.svc.refresh(dto.refreshToken);
  }

  @Public()
  @Post('forgot-password/send-code')
  forgotPasswordSendCode(@Body() dto: ForgotPasswordSendCodeDto) {
    return this.svc.forgotPasswordSendCode(dto.email);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.svc.resetPassword(dto.email, dto.code, dto.newPassword);
  }

  @Post('logout')
  logout() {
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: any) {
    return this.svc.me(user.sub);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.svc.updateProfile(user.sub, dto);
  }
}
