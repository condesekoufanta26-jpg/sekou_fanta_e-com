import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRole = this.reflector.get<string>('role', context.getHandler());
    
    console.log('=== ROLES GUARD DEBUG ===');
    console.log('Required role:', requiredRole);
    
    if (!requiredRole) {
      console.log('No role required, access granted');
      return true;
    }
    
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    console.log('User object:', user);
    console.log('User role:', user?.role);
    
    if (!user) {
      console.log('No user object, access denied');
      throw new ForbiddenException('Forbidden resource');
    }
    
    if (user.role !== requiredRole) {
      console.log(`Role mismatch: required "${requiredRole}", got "${user.role}"`);
      throw new ForbiddenException('Forbidden resource');
    }
    
    console.log('Access granted!');
    return true;
  }
}