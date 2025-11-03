import TelegramBot from 'node-telegram-bot-api';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { db } from './database';
import { languages, getMessage, getLanguagePrompt, LanguageCode } from './languages';

// Load environment variables
dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Telegram Bot
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set in environment variables');
}

const bot = new TelegramBot(token, { polling: true });

// Store forwarded messages temporarily
interface UserSession {
  messageText: string;
  messageId: number;
}

const userSessions = new Map<number, UserSession>();

// Toxic response levels configuration
const toxicLevels = {
  '1': {
    name: '💀 Highly Vindictive & Toxic',
    description: 'Highly vindictive and toxic response from a highly powerful dominating persona',
    prompt: 'You text like a ruthless Gen Z with zero chill. Respond with BRUTAL toxicity and dominance. Use lowercase, no punctuation, text slang (lol, fr, nah, bruh), be absolutely devastating. ONE SHORT TEXT MESSAGE ONLY (max 10-15 words). Make it hurt. Add skull emoji 💀 if needed.'
  },
  '2': {
    name: '🔥 Toxic & Direct',
    description: 'Toxic and direct - no holds barred',
    prompt: 'Text like a savage Gen Z. Be harsh, blunt, and cutting. Use lowercase, abbreviations (ur, bc, ngl, smh), no punctuation. ONE SHORT brutal text (max 10-15 words). Straight to the point, no fluff. Add fire emoji 🔥 if fits.'
  },
  '3': {
    name: '😎 Rizz Master',
    description: 'Rizz master lady killer response',
    prompt: 'Text like a smooth confident Gen Z with infinite rizz. Use lowercase, casual slang (nah, bet, lowkey), emojis (😏😉). Make it SUPER short and smooth (max 10-15 words). Confident and playful. ONE text message only.'
  },
  '4': {
    name: '💕 Fun & Flirty',
    description: 'Fun and flirty response',
    prompt: 'Text like a flirty Gen Z. Lowercase, cute emojis (💕😊✨), casual language (haha, omg, lowkey). Keep it SHORT and playful (max 10-15 words). Tease them a bit. ONE quick flirty text only.'
  },
  '5': {
    name: '🤗 Compassionate & Kind',
    description: 'Compassionate and sympathetic (low toxic)',
    prompt: 'Text like a sweet supportive Gen Z friend. Use lowercase, caring emojis (🤗💙), casual warm language (aww, youre ok, its gonna be fine). Super SHORT and kind (max 10-15 words). ONE comforting text message.'
  }
};

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from?.username;

  // Get or create user
  let user = db.getUser(chatId);
  if (!user) {
    user = db.createUser(chatId, username);
  }

  const welcomeMessage = getMessage(user.language as LanguageCode, 'welcome');
  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// Handle /language command
bot.onText(/\/language/, (msg) => {
  const chatId = msg.chat.id;
  let user = db.getUser(chatId);

  if (!user) {
    user = db.createUser(chatId, msg.from?.username);
  }

  const languageMessage = getMessage(user.language as LanguageCode, 'chooseLanguage');

  const keyboard = {
    inline_keyboard: Object.entries(languages).map(([code, lang]) => [
      { text: lang.name, callback_data: `lang_${code}` }
    ])
  };

  bot.sendMessage(chatId, languageMessage, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

// Handle /subscribe command
bot.onText(/\/subscribe/, (msg) => {
  const chatId = msg.chat.id;
  let user = db.getUser(chatId);

  if (!user) {
    user = db.createUser(chatId, msg.from?.username);
  }

  const subscribeMessage = getMessage(user.language as LanguageCode, 'subscribeInfo');

  const keyboard = {
    inline_keyboard: [
      [{ text: '💎 Subscribe $2.99/month', url: 'https://buy.stripe.com/test_PLACEHOLDER' }],
      [{ text: '❓ Contact Support', url: 'https://t.me/YOUR_SUPPORT' }]
    ]
  };

  bot.sendMessage(chatId, subscribeMessage, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

// Handle /status command
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const user = db.getUser(chatId);

  if (!user) {
    bot.sendMessage(chatId, 'User not found. Send /start to begin.');
    return;
  }

  let statusMessage = '';

  if (user.isVip || user.subscriptionStatus === 'vip') {
    statusMessage = `📊 *Your Status*\n\n` +
      `Plan: VIP 👑\n` +
      `Responses: UNLIMITED ∞\n` +
      `Total messages sent: ${user.totalMessagesUsed}\n\n` +
      `You have unlimited access! Enjoy! 💎`;
  } else if (user.subscriptionStatus === 'free') {
    const remaining = 5 - user.freeMessagesUsed;
    statusMessage = `📊 *Your Status*\n\n` +
      `Plan: Free Trial\n` +
      `Responses used: ${user.freeMessagesUsed}/5\n` +
      `Remaining: ${remaining}\n\n` +
      `Upgrade with /subscribe for 100 responses/month!`;
  } else if (user.subscriptionStatus === 'active') {
    const remaining = 100 - user.monthlyQuotaUsed;
    const expiryDate = user.subscriptionExpiry
      ? user.subscriptionExpiry.toLocaleDateString()
      : 'N/A';
    statusMessage = `📊 *Your Status*\n\n` +
      `Plan: Premium 💎\n` +
      `Responses used: ${user.monthlyQuotaUsed}/100\n` +
      `Remaining: ${remaining}\n` +
      `Renewal date: ${expiryDate}`;
  } else {
    statusMessage = `📊 *Your Status*\n\n` +
      `Plan: Expired\n\n` +
      `Renew with /subscribe to continue!`;
  }

  bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
});

// ===== ADMIN COMMANDS =====
const isAdmin = (chatId: number): boolean => {
  const adminId = parseInt(process.env.ADMIN_CHAT_ID || '0');
  return chatId === adminId;
};

// Grant VIP access
bot.onText(/\/admin_vip (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;

  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }

  const targetUserId = parseInt(match![1]);
  const success = db.grantVip(targetUserId);

  if (success) {
    bot.sendMessage(chatId, `✅ VIP access granted to user ${targetUserId}\n\nThey now have UNLIMITED responses!`);
    // Notify the user
    bot.sendMessage(targetUserId, '🎉 *Congratulations!*\n\nYou have been granted VIP access with UNLIMITED responses! 💎\n\nEnjoy!', { parse_mode: 'Markdown' }).catch(() => {});
  } else {
    bot.sendMessage(chatId, `❌ User ${targetUserId} not found. They need to /start the bot first.`);
  }
});

// Revoke VIP access
bot.onText(/\/admin_revoke (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;

  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }

  const targetUserId = parseInt(match![1]);
  const success = db.revokeVip(targetUserId);

  if (success) {
    bot.sendMessage(chatId, `✅ VIP access revoked for user ${targetUserId}`);
    bot.sendMessage(targetUserId, 'ℹ️ Your VIP access has been revoked. You now have the free tier (5 responses).').catch(() => {});
  } else {
    bot.sendMessage(chatId, `❌ User ${targetUserId} not found.`);
  }
});

// List all VIP users
bot.onText(/\/admin_vips/, (msg) => {
  const chatId = msg.chat.id;

  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }

  const vips = db.getVipUsers();

  if (vips.length === 0) {
    bot.sendMessage(chatId, '📋 No VIP users yet.');
    return;
  }

  let message = `👑 *VIP Users (${vips.length})*\n\n`;
  vips.forEach(user => {
    message += `• ${user.userId} (@${user.username || 'unknown'})\n  Total messages: ${user.totalMessagesUsed}\n\n`;
  });

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// List all users
bot.onText(/\/admin_users/, (msg) => {
  const chatId = msg.chat.id;

  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }

  const allUsers = db.getAllUsers();
  const stats = {
    total: allUsers.length,
    vip: allUsers.filter(u => u.isVip).length,
    premium: allUsers.filter(u => u.subscriptionStatus === 'active').length,
    free: allUsers.filter(u => u.subscriptionStatus === 'free').length,
  };

  let message = `📊 *User Statistics*\n\n`;
  message += `Total Users: ${stats.total}\n`;
  message += `VIP: ${stats.vip} 👑\n`;
  message += `Premium: ${stats.premium} 💎\n`;
  message += `Free: ${stats.free}\n\n`;
  message += `Recent users:\n`;

  const recent = allUsers
    .sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime())
    .slice(0, 10);

  recent.forEach(user => {
    const status = user.isVip ? '👑 VIP' : user.subscriptionStatus === 'active' ? '💎 Premium' : '🆓 Free';
    message += `${user.userId} - ${status} (${user.totalMessagesUsed} msgs)\n`;
  });

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Manually activate subscription
bot.onText(/\/admin_activate (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;

  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }

  const targetUserId = parseInt(match![1]);
  db.activateSubscription(targetUserId);
  bot.sendMessage(chatId, `✅ 1-month subscription activated for user ${targetUserId}`);
  bot.sendMessage(targetUserId, '🎉 Your premium subscription has been activated!\n\nYou now have 100 responses/month.', { parse_mode: 'Markdown' }).catch(() => {});
});

// Admin help
bot.onText(/\/admin$/, (msg) => {
  const chatId = msg.chat.id;

  if (!isAdmin(chatId)) {
    return;
  }

  const helpMessage = `🔧 *Admin Commands*\n\n` +
    `*VIP Management:*\n` +
    `/admin_vip <userId> - Grant unlimited access\n` +
    `/admin_revoke <userId> - Remove VIP status\n` +
    `/admin_vips - List all VIP users\n\n` +
    `*Subscription:*\n` +
    `/admin_activate <userId> - Give 1 month premium\n\n` +
    `*Stats:*\n` +
    `/admin_users - View user statistics\n\n` +
    `*Your Chat ID:* ${chatId}`;

  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Handle any message (including forwarded ones)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text || msg.caption || '';

  // Ignore commands
  if (messageText.startsWith('/')) {
    return;
  }

  // Check if message has content
  if (!messageText) {
    bot.sendMessage(chatId, '❌ Please send or forward a text message.');
    return;
  }

  // Get or create user
  let user = db.getUser(chatId);
  if (!user) {
    user = db.createUser(chatId, msg.from?.username);
  }

  // Check if user can send message
  const canSend = db.canUserSendMessage(chatId);

  if (!canSend.allowed) {
    if (canSend.reason === 'free_limit_reached') {
      const message = getMessage(user.language as LanguageCode, 'freeLimitReached');
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } else if (canSend.reason === 'quota_exceeded') {
      const expiryDate = user.subscriptionExpiry
        ? user.subscriptionExpiry.toLocaleDateString()
        : 'N/A';
      const message = getMessage(user.language as LanguageCode, 'quotaExceeded', { date: expiryDate });
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } else if (canSend.reason === 'subscription_expired') {
      const message = getMessage(user.language as LanguageCode, 'subscriptionExpired');
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }
    return;
  }

  // Store the message in user session
  userSessions.set(chatId, {
    messageText: messageText,
    messageId: msg.message_id
  });

  // Create inline keyboard with toxic levels
  const keyboard = {
    inline_keyboard: [
      [{ text: toxicLevels['1'].name, callback_data: 'level_1' }],
      [{ text: toxicLevels['2'].name, callback_data: 'level_2' }],
      [{ text: toxicLevels['3'].name, callback_data: 'level_3' }],
      [{ text: toxicLevels['4'].name, callback_data: 'level_4' }],
      [{ text: toxicLevels['5'].name, callback_data: 'level_5' }]
    ]
  };

  const chooseMessage = getMessage(user.language as LanguageCode, 'chooseLevel');

  // Send message with response level options
  bot.sendMessage(
    chatId,
    chooseMessage,
    { reply_markup: keyboard }
  );
});

// Handle callback queries (button presses)
bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;

  if (!chatId || !messageId) {
    return;
  }

  const data = query.data || '';

  // Handle language selection
  if (data.startsWith('lang_')) {
    const langCode = data.replace('lang_', '') as LanguageCode;

    db.updateUser(chatId, { language: langCode });

    const message = getMessage(langCode, 'languageSet', {
      language: languages[langCode].name
    });

    bot.answerCallbackQuery(query.id, { text: '✅ Language updated!' });
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    return;
  }

  // Handle toxic level selection
  if (data.startsWith('level_')) {
    const level = data.replace('level_', '') as keyof typeof toxicLevels;

    if (!level || !toxicLevels[level]) {
      bot.answerCallbackQuery(query.id, { text: '❌ Invalid level selected' });
      return;
    }

    // Get user
    let user = db.getUser(chatId);
    if (!user) {
      user = db.createUser(chatId, query.from.username);
    }

    // Get the stored message
    const session = userSessions.get(chatId);
    if (!session) {
      bot.answerCallbackQuery(query.id, { text: '❌ Session expired. Please send the message again.' });
      return;
    }

    // Answer the callback query to remove loading state
    bot.answerCallbackQuery(query.id, { text: `Generating ${toxicLevels[level].name} response...` });

    // Edit the message to show loading
    const generatingMessage = getMessage(user.language as LanguageCode, 'generating');
    bot.editMessageText(
      generatingMessage,
      {
        chat_id: chatId,
        message_id: messageId
      }
    );

    try {
      // Generate response using OpenAI
      const languageInstruction = getLanguagePrompt(user.language as LanguageCode);
      const fullPrompt = toxicLevels[level].prompt + ' ' + languageInstruction;

      const response = await generateResponse(session.messageText, fullPrompt);

      // Increment message count
      db.incrementMessageCount(chatId);

      // Send the generated response
      bot.sendMessage(
        chatId,
        `${toxicLevels[level].name}\n\n"${response}"`,
        { parse_mode: 'Markdown' }
      );

      // Show remaining quota
      const updatedUser = db.getUser(chatId)!;
      let remaining = '';
      if (updatedUser.subscriptionStatus === 'free') {
        const count = 5 - updatedUser.freeMessagesUsed;
        remaining = getMessage(user.language as LanguageCode, 'remainingFree', { count: count.toString() });
      } else if (updatedUser.subscriptionStatus === 'active') {
        const count = 100 - updatedUser.monthlyQuotaUsed;
        remaining = getMessage(user.language as LanguageCode, 'remainingPremium', { count: count.toString() });
      }

      // Edit the loading message
      const successMessage = getMessage(user.language as LanguageCode, 'success');
      bot.editMessageText(
        `${successMessage}\n${remaining}`,
        {
          chat_id: chatId,
          message_id: messageId
        }
      );

      // Clean up session
      userSessions.delete(chatId);

    } catch (error) {
      console.error('Error generating response:', error);
      bot.editMessageText(
        '❌ Error generating response. Please try again.',
        {
          chat_id: chatId,
          message_id: messageId
        }
      );
    }
  }
});

// Function to generate response using OpenAI
async function generateResponse(messageText: string, systemPrompt: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: messageText
      }
    ],
    max_tokens: 50,
    temperature: 0.9,
  });

  return completion.choices[0]?.message?.content?.trim() || 'Unable to generate response.';
}

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('🤖 Telegram Toxic Response Bot is running...');
console.log('Features: Multi-language, Free tier (5 msgs), Subscription ($2.99/100 msgs)');
