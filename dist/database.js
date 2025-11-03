"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DB_PATH = path.join(__dirname, '../data/users.json');
class Database {
    constructor() {
        this.users = new Map();
        this.load();
    }
    load() {
        try {
            if (fs.existsSync(DB_PATH)) {
                const data = fs.readFileSync(DB_PATH, 'utf-8');
                const parsed = JSON.parse(data);
                this.users = new Map(Object.entries(parsed).map(([key, value]) => [
                    parseInt(key),
                    {
                        ...value,
                        chatHistory: value.chatHistory || [],
                        createdAt: new Date(value.createdAt),
                        lastUsed: new Date(value.lastUsed),
                        subscriptionExpiry: value.subscriptionExpiry
                            ? new Date(value.subscriptionExpiry)
                            : undefined,
                    },
                ]));
            }
        }
        catch (error) {
            console.error('Error loading database:', error);
            this.users = new Map();
        }
    }
    save() {
        try {
            const dir = path.dirname(DB_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const data = Object.fromEntries(this.users);
            fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
        }
        catch (error) {
            console.error('Error saving database:', error);
        }
    }
    getUser(userId) {
        return this.users.get(userId);
    }
    createUser(userId, username) {
        const user = {
            userId,
            username,
            language: 'en',
            freeMessagesUsed: 0,
            subscriptionStatus: 'free',
            monthlyQuotaUsed: 0,
            totalMessagesUsed: 0,
            isVip: false,
            chatHistory: [],
            createdAt: new Date(),
            lastUsed: new Date(),
        };
        this.users.set(userId, user);
        this.save();
        return user;
    }
    // Chat history management
    addToChatHistory(userId, role, content) {
        const user = this.users.get(userId);
        if (!user)
            return;
        if (!user.chatHistory) {
            user.chatHistory = [];
        }
        user.chatHistory.push({
            role,
            content,
            timestamp: new Date()
        });
        // Keep only last 10 messages
        if (user.chatHistory.length > 10) {
            user.chatHistory = user.chatHistory.slice(-10);
        }
        this.users.set(userId, user);
        this.save();
    }
    getChatHistory(userId) {
        const user = this.users.get(userId);
        return user?.chatHistory || [];
    }
    clearChatHistory(userId) {
        const user = this.users.get(userId);
        if (user) {
            user.chatHistory = [];
            this.users.set(userId, user);
            this.save();
        }
    }
    updateUser(userId, updates) {
        const user = this.users.get(userId);
        if (user) {
            Object.assign(user, updates, { lastUsed: new Date() });
            this.users.set(userId, user);
            this.save();
        }
    }
    incrementMessageCount(userId) {
        const user = this.users.get(userId);
        if (!user)
            return false;
        user.totalMessagesUsed++;
        user.lastUsed = new Date();
        if (user.subscriptionStatus === 'free') {
            user.freeMessagesUsed++;
        }
        else if (user.subscriptionStatus === 'active') {
            user.monthlyQuotaUsed++;
        }
        this.users.set(userId, user);
        this.save();
        return true;
    }
    canUserSendMessage(userId) {
        const user = this.users.get(userId);
        if (!user)
            return { allowed: false, reason: 'User not found' };
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
    activateSubscription(userId) {
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
    resetMonthlyQuota(userId) {
        const user = this.users.get(userId);
        if (user) {
            user.monthlyQuotaUsed = 0;
            this.users.set(userId, user);
            this.save();
        }
    }
    // VIP Management
    grantVip(userId) {
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
    revokeVip(userId) {
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
    getAllUsers() {
        return Array.from(this.users.values());
    }
    getVipUsers() {
        return this.getAllUsers().filter(u => u.isVip);
    }
}
exports.db = new Database();
