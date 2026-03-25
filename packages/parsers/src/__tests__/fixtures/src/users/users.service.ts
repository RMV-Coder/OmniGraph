import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  async findById(userId: string) {
    return { id: userId, name: 'Test User' };
  }
}
