import * as fs from 'fs';
import * as path from 'path';

interface UserData {
  userId: number;
  username?: string;
  language: string;
  freeMessagesUsed: number;
  subscriptionStatus: 'free' | 'active' | 'expired' | 'vip';
  subscriptionExpiry?: Date;
  monthlyQuotaUsed: number;
  totalMessagesUsed: number;
  isVip: boolean;
  createdAt: Date;
  lastUsed: Date;
}

const DB_PATH = path.join(__dirname, '../data/users.json');

class Database {
  private users: Map<number, UserData>;

  constructor() {
    this.users = new Map();
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(data);
        this.users = new Map(
          Object.entries(parsed).map(([key, value]: [string, any]) => [
            parseInt(key),
            {
              ...value,
              createdAt: new Date(value.createdAt),
              lastUsed: new Date(value.lastUsed),
              subscriptionExpiry: value.subscriptionExpiry
                ? new Date(value.subscriptionExpiry)
                : undefined,
            },
          ])
        );
      }
    } catch (error) {
      console.error('Error loading database:', error);
      this.users = new Map();
    }
  }

  private save() {
    try {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = Object.fromEntries(this.users);
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving database:', error);
    }
  }

  getUser(userId: number): UserData | undefined {
    return this.users.get(userId);
  }

  createUser(userId: number, username?: string): UserData {
    const user: UserData = {
      userId,
      username,
      language: 'en',
      freeMessagesUsed: 0,
      subscriptionStatus: 'free',
      monthlyQuotaUsed: 0,
      totalMessagesUsed: 0,
      isVip: false,
      createdAt: new Date(),
      lastUsed: new Date(),
    };
    this.users.set(userId, user);
    this.save();
    return user;
  }

  updateUser(userId: number, updates: Partial<UserData>) {
    const user = this.users.get(userId);
    if (user) {
      Object.assign(user, updates, { lastUsed: new Date() });
      this.users.set(userId, user);
      this.save();
    }
  }

  incrementMessageCount(userId: number): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    user.totalMessagesUsed++;
    user.lastUsed = new Date();

    if (user.subscriptionStatus === 'free') {
      user.freeMessagesUsed++;
    } else if (user.subscriptionStatus === 'active') {
      user.monthlyQuotaUsed++;
    }

    this.users.set(userId, user);
    this.save();
    return true;
  }

  canUserSendMessage(userId: number): { allowed: boolean; reason?: string } {
    const user = this.users.get(userId);
    if (!user) return { allowed: false, reason: 'User not found' };

    // VIP users have unlimited access
    if (user.isVip || user.subscriptionStatus === 'vip') {
      return { allowed: true };
    }

    // Check if free tier
    if (user.subscriptionStatus === 'free') {
      if (user.freeMessagesUsed >= 5) {
        return {
          allowed: false,
          reason: 'free_limit_reached',
        };
      }
      return { allowed: true };
    }

    // Check if subscription is active
    if (user.subscriptionStatus === 'active') {
      if (user.subscriptionExpiry && user.subscriptionExpiry < new Date()) {
        user.subscriptionStatus = 'expired';
        this.users.set(userId, user);
        this.save();
        return {
          allowed: false,
          reason: 'subscription_expired',
        };
      }

      if (user.monthlyQuotaUsed >= 100) {
        return {
          allowed: false,
          reason: 'quota_exceeded',
        };
      }

      return { allowed: true };
    }

    return { allowed: false, reason: 'subscription_required' };
  }

  activateSubscription(userId: number) {
    const user = this.users.get(userId);
    if (user) {
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);

      user.subscriptionStatus = 'active';
      user.subscriptionExpiry = expiry;
      user.monthlyQuotaUsed = 0;

      this.users.set(userId, user);
      this.save();
    }
  }

  resetMonthlyQuota(userId: number) {
    const user = this.users.get(userId);
    if (user) {
      user.monthlyQuotaUsed = 0;
      this.users.set(userId, user);
      this.save();
    }
  }

  // VIP Management
  grantVip(userId: number) {
    const user = this.users.get(userId);
    if (user) {
      user.isVip = true;
      user.subscriptionStatus = 'vip';
      this.users.set(userId, user);
      this.save();
      return true;
    }
    return false;
  }

  revokeVip(userId: number) {
    const user = this.users.get(userId);
    if (user) {
      user.isVip = false;
      user.subscriptionStatus = 'free';
      this.users.set(userId, user);
      this.save();
      return true;
    }
    return false;
  }

  getAllUsers(): UserData[] {
    return Array.from(this.users.values());
  }

  getVipUsers(): UserData[] {
    return this.getAllUsers().filter(u => u.isVip);
  }
}

export const db = new Database();
export { UserData };
