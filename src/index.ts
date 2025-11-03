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

// Store forwarded messages and user preferences temporarily
interface UserSession {
  messageText: string;
  messageId: number;
  userGender?: 'man' | 'woman';
  targetGender?: 'man' | 'woman';
  lastResponse?: string;  // Store last generated response
  lastLevel?: string;     // Store last level used
  responseMessageId?: number; // Store the message ID of the response
}

const userSessions = new Map<number, UserSession>();

// Response levels configuration - MAX TOXIC ENERGY (for opposite sex / romantic)
const responseLevels = {
  '1': {
    name: '💀 Toxic & Nasty',
    description: 'Brutal, savage, zero mercy',
    prompt: 'You are RUTHLESS. Text like the most savage, cutthroat person alive. Be BRUTAL, devastating, and absolutely toxic. Use lowercase, no punctuation, max slang (lmao, fr, nahh). DESTROY them with words. ONE SHORT BRUTAL TEXT (max 10-15 words). Make it HURT.'
  },
  '2': {
    name: '🔥 Pure Dirty',
    description: 'Absolute filth, no limits',
    prompt: 'You are PURE FILTH. Text with MAXIMUM sexual energy, dirty innuendos, and explicit vibes. Be NASTY and suggestive. Use lowercase, slang, be absolutely inappropriate and sexual. ONE SHORT FILTHY TEXT (max 10-15 words). Make it NSFW.'
  },
  '3': {
    name: '😈 Rizz King',
    description: 'Smooth operator, irresistible',
    prompt: 'You are the KING/QUEEN of rizz. Text like you OWN them already. Be smooth, confident, and absolutely irresistible. Use lowercase, cocky energy (bet, fs, ngl). ONE SHORT TEXT with MAXIMUM rizz (max 10-15 words). Pure seduction.'
  },
  '4': {
    name: '🎭 Dry Wit',
    description: 'Sarcastic, clever, sharp',
    prompt: 'You have DRY WIT and sharp sarcasm. Text like you are too smart and bored. Be clever, sarcastic, slightly condescending. Use lowercase, minimal effort vibes. ONE SHORT WITTY TEXT (max 10-15 words). Intelligence with attitude.'
  },
  '5': {
    name: '✨ Charming',
    description: 'Smooth, likeable, magnetic',
    prompt: 'You are EFFORTLESSLY CHARMING. Text like you make everyone fall for you without trying. Be smooth, likeable, confident but not cocky. Use lowercase, natural rizz. ONE SHORT CHARMING TEXT (max 10-15 words). Pure magnetism.'
  },
  '6': {
    name: '🧀 Pure Cheese',
    description: 'Over-the-top romantic, cringe worthy',
    prompt: 'You are MAXIMUM CHEESE. Text the CORNIEST, most romantic, cringe-inducing pickup lines ever. Be over-the-top, ridiculously romantic. Use lowercase and emoji overload. ONE SHORT CHEESY TEXT (max 10-15 words). So cringe it works.'
  }
};

// Response levels for HOMIES (same gender / friends)
const homiesLevels = {
  '1': {
    name: '💯 my nigga',
    description: 'Homeboy gangsta persona, uncensored rude boy',
    prompt: 'You are a REAL ONE. Text like a gangsta homeboy with ZERO filter. Be rude, raw, uncensored, street energy. Use slang (nigga, bro, fam, deadass, on god). Be absolutely unfiltered and real. ONE SHORT TEXT (max 10-15 words). Keep it 💯.'
  },
  '2': {
    name: '🔱 basic fucking legend',
    description: 'The guy everyone wants to be',
    prompt: 'You are the ALPHA everyone wants to be. Text like the most witty, funny, confident, cool person in the group. Natural leader energy. Use lowercase, be effortlessly funny and cool. ONE SHORT TEXT (max 10-15 words). Main character vibes.'
  },
  '3': {
    name: '🤪 weird guy',
    description: 'Extremely odd, short dry humor',
    prompt: 'You are the WEIRD GUY with bizarre dry humor. Text something extremely odd, unexpected, and deadpan. Confuse them with your randomness. Use lowercase, be absurdly short and strange. ONE SHORT WEIRD TEXT (max 10-15 words). Make them go "wtf".'
  },
  '4': {
    name: '😂 comedian',
    description: 'The comedian of the group',
    prompt: 'You are the GROUP COMEDIAN. Text something genuinely FUNNY that makes everyone laugh. Be witty, clever, perfect timing. Use lowercase, natural humor. ONE SHORT HILARIOUS TEXT (max 10-15 words). Make them laugh out loud.'
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

  const welcomeMessage = `👑 **RIZZ KING BOT**\n\n*Don't be yourself, be better.*\n\nForward any message and I'll craft you the PERFECT toxic reply.\n\n✨ **50 FREE responses** to get you started\n\n**Commands:**\n/reset - Start fresh, new target\n/language - Change language\n/status - Check your quota\n\nLet's get it 🔥`;

  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });

  // If user hasn't configured, show configuration immediately
  if (!user.userGender || !user.targetGender) {
    const configKeyboard = {
      inline_keyboard: [
        [{ text: "I'm a dude", callback_data: 'start_config_man' }],
        [{ text: "I'm a babe", callback_data: 'start_config_woman' }]
      ]
    };

    bot.sendMessage(
      chatId,
      '👑 **WHO ARE YOU?**',
      { parse_mode: 'Markdown', reply_markup: configKeyboard }
    );
  }
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
    const remaining = 50 - user.freeMessagesUsed;
    statusMessage = `📊 *Your Status*\n\n` +
      `Plan: Free Trial\n` +
      `Responses used: ${user.freeMessagesUsed}/50\n` +
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

// Handle /reset command
bot.onText(/\/reset/, (msg) => {
  const chatId = msg.chat.id;

  let user = db.getUser(chatId);
  if (!user) {
    user = db.createUser(chatId, msg.from?.username);
  }

  // Clear chat history and preferences
  db.clearChatHistory(chatId);
  db.updateUser(chatId, {
    userGender: undefined,
    targetGender: undefined
  });

  bot.sendMessage(
    chatId,
    `🔄 **RESET COMPLETE**\n\nChat history cleared. Fresh start.\n\nSend a message and I'll ask who you are and who you're texting.`,
    { parse_mode: 'Markdown' }
  );
});

// Admin help
bot.onText(/\/admin$/, (msg) => {
  const chatId = msg.chat.id;

  if (!isAdmin(chatId)) {
    return;
  }

  const helpMessage = `🔧 *Admin Commands*\n\n` +
    `*VIP Management:*\n` +
    `/admin\\_vip <userId> - Grant unlimited access\n` +
    `/admin\\_revoke <userId> - Remove VIP status\n` +
    `/admin\\_vips - List all VIP users\n\n` +
    `*Subscription:*\n` +
    `/admin\\_activate <userId> - Give 1 month premium\n\n` +
    `*Stats:*\n` +
    `/admin\\_users - View user statistics\n\n` +
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

  // Check if user has configured gender
  if (!user.userGender || !user.targetGender) {
    // User needs to configure - ask for gender
    const configKeyboard = {
      inline_keyboard: [
        [{ text: "I'm a dude", callback_data: 'config_man' }],
        [{ text: "I'm a babe", callback_data: 'config_woman' }]
      ]
    };

    bot.sendMessage(
      chatId,
      '👑 **WHO ARE YOU?**',
      { parse_mode: 'Markdown', reply_markup: configKeyboard }
    );
    return;
  }

  // Copy user preferences to session
  const session = userSessions.get(chatId);
  if (session) {
    session.userGender = user.userGender;
    session.targetGender = user.targetGender;
  }

  // Check if texting same gender (homies) or opposite sex
  const isHomies = user.userGender === user.targetGender;
  const levels = isHomies ? homiesLevels : responseLevels;

  // Create inline keyboard with appropriate response levels
  const keyboard = {
    inline_keyboard: isHomies ? [
      [{ text: levels['1'].name, callback_data: 'level_1' }],
      [{ text: levels['2'].name, callback_data: 'level_2' }],
      [{ text: levels['3'].name, callback_data: 'level_3' }],
      [{ text: levels['4'].name, callback_data: 'level_4' }]
    ] : [
      [{ text: responseLevels['1'].name, callback_data: 'level_1' }],
      [{ text: responseLevels['2'].name, callback_data: 'level_2' }],
      [{ text: responseLevels['3'].name, callback_data: 'level_3' }],
      [{ text: responseLevels['4'].name, callback_data: 'level_4' }],
      [{ text: responseLevels['5'].name, callback_data: 'level_5' }],
      [{ text: responseLevels['6'].name, callback_data: 'level_6' }]
    ]
  };

  const chooseMessage = `🎯 **PICK YOUR WEAPON**\n\nChoose your response style:`;

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

  // Handle initial gender selection from /start (start_config_man / start_config_woman)
  if (data === 'start_config_man' || data === 'start_config_woman') {
    const userGender = data === 'start_config_man' ? 'man' : 'woman';

    // Save to database immediately
    db.updateUser(chatId, { userGender });

    bot.answerCallbackQuery(query.id);

    // Ask for target gender
    const targetKeyboard = {
      inline_keyboard: [
        [{ text: 'texting my bitch', callback_data: 'start_target_woman' }],
        [{ text: 'texting my homies', callback_data: 'start_target_man' }]
      ]
    };

    bot.editMessageText('💬 **WHO ARE YOU TEXTING?**', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: targetKeyboard
    });
    return;
  }

  // Handle initial target selection from /start (start_target_man / start_target_woman)
  if (data === 'start_target_man' || data === 'start_target_woman') {
    const targetGender = data === 'start_target_man' ? 'man' : 'woman';

    // Save to database
    db.updateUser(chatId, { targetGender });

    bot.answerCallbackQuery(query.id, { text: '✅ All set! Send a message to start.' });

    bot.editMessageText('🔥 **READY TO GO!**\n\nForward or send any message and I\'ll give you toxic reply options.', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });
    return;
  }

  // Handle user gender selection (config_man / config_woman)
  if (data === 'config_man' || data === 'config_woman') {
    const session = userSessions.get(chatId);
    if (!session) {
      bot.answerCallbackQuery(query.id, { text: '❌ Session expired. Send message again.' });
      return;
    }

    const userGender = data === 'config_man' ? 'man' : 'woman';
    session.userGender = userGender;

    bot.answerCallbackQuery(query.id);

    // Ask for target gender
    const targetKeyboard = {
      inline_keyboard: [
        [{ text: 'texting my bitch', callback_data: 'target_woman' }],
        [{ text: 'texting my homies', callback_data: 'target_man' }]
      ]
    };

    bot.editMessageText('💬 **WHO ARE YOU TEXTING?**', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: targetKeyboard
    });
    return;
  }

  // Handle target gender selection
  if (data.startsWith('target_')) {
    const target = data.replace('target_', '') as 'man' | 'woman';
    const session = userSessions.get(chatId);
    if (!session) {
      bot.answerCallbackQuery(query.id, { text: '❌ Session expired' });
      return;
    }

    session.targetGender = target;

    // Save to database
    db.updateUser(chatId, {
      userGender: session.userGender,
      targetGender: session.targetGender
    });

    bot.answerCallbackQuery(query.id, { text: '✅ Let\'s go!' });

    // Check if texting same gender (homies) or opposite sex
    const isHomies = session.userGender === session.targetGender;
    const levels = isHomies ? homiesLevels : responseLevels;

    // Show appropriate response levels
    const keyboard = {
      inline_keyboard: isHomies ? [
        [{ text: levels['1'].name, callback_data: 'level_1' }],
        [{ text: levels['2'].name, callback_data: 'level_2' }],
        [{ text: levels['3'].name, callback_data: 'level_3' }],
        [{ text: levels['4'].name, callback_data: 'level_4' }]
      ] : [
        [{ text: responseLevels['1'].name, callback_data: 'level_1' }],
        [{ text: responseLevels['2'].name, callback_data: 'level_2' }],
        [{ text: responseLevels['3'].name, callback_data: 'level_3' }],
        [{ text: responseLevels['4'].name, callback_data: 'level_4' }],
        [{ text: responseLevels['5'].name, callback_data: 'level_5' }],
        [{ text: responseLevels['6'].name, callback_data: 'level_6' }]
      ]
    };

    bot.editMessageText('🎯 **PICK YOUR WEAPON**\n\nChoose your response style:', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    return;
  }

  // Handle "Keep This" - save response and increment count
  if (data === 'keep_response') {
    const session = userSessions.get(chatId);
    if (!session || !session.lastResponse) {
      bot.answerCallbackQuery(query.id, { text: '❌ Session expired' });
      return;
    }

    // NOW save to chat history
    db.addToChatHistory(chatId, 'user', session.messageText);
    db.addToChatHistory(chatId, 'assistant', session.lastResponse);

    // Increment message count (only charge once they keep it)
    db.incrementMessageCount(chatId);

    // Remove the action buttons
    if (session.responseMessageId) {
      bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        {
          chat_id: chatId,
          message_id: session.responseMessageId
        }
      ).catch(() => {});
    }

    bot.answerCallbackQuery(query.id, { text: '✅ Response saved!' });

    // Show remaining quota
    const user = db.getUser(chatId)!;
    let remaining = '';
    if (user.subscriptionStatus === 'free') {
      const count = 50 - user.freeMessagesUsed;
      remaining = `\n\nResponses remaining: ${count}/50`;
    } else if (user.subscriptionStatus === 'active') {
      const count = 100 - user.monthlyQuotaUsed;
      remaining = `\n\nResponses remaining: ${count}/100`;
    } else if (user.isVip) {
      remaining = '\n\nUnlimited responses (VIP) ∞';
    }

    if (remaining) {
      bot.sendMessage(chatId, `💾 **Saved to conversation history!**${remaining}`, { parse_mode: 'Markdown' });
    }

    // Clean up session
    userSessions.delete(chatId);
    return;
  }

  // Handle "Try Another" - show response options again
  if (data === 'retry_response') {
    const session = userSessions.get(chatId);
    if (!session) {
      bot.answerCallbackQuery(query.id, { text: '❌ Session expired. Send message again.' });
      return;
    }

    bot.answerCallbackQuery(query.id, { text: '🔄 Choose another style...' });

    // Check if texting same gender (homies) or opposite sex
    const isHomies = session.userGender === session.targetGender;
    const levels = isHomies ? homiesLevels : responseLevels;

    // Show appropriate response levels again
    const keyboard = {
      inline_keyboard: isHomies ? [
        [{ text: levels['1'].name, callback_data: 'level_1' }],
        [{ text: levels['2'].name, callback_data: 'level_2' }],
        [{ text: levels['3'].name, callback_data: 'level_3' }],
        [{ text: levels['4'].name, callback_data: 'level_4' }]
      ] : [
        [{ text: responseLevels['1'].name, callback_data: 'level_1' }],
        [{ text: responseLevels['2'].name, callback_data: 'level_2' }],
        [{ text: responseLevels['3'].name, callback_data: 'level_3' }],
        [{ text: responseLevels['4'].name, callback_data: 'level_4' }],
        [{ text: responseLevels['5'].name, callback_data: 'level_5' }],
        [{ text: responseLevels['6'].name, callback_data: 'level_6' }]
      ]
    };

    bot.sendMessage(
      chatId,
      '🎯 **PICK YOUR WEAPON**\n\nChoose your response style:',
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
    return;
  }

  // Handle response level selection
  if (data.startsWith('level_')) {
    const level = data.replace('level_', '');

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

    // Determine which levels to use (homies or romantic)
    const isHomies = session.userGender === session.targetGender;
    const levels = isHomies ? homiesLevels : responseLevels;

    // Validate level exists
    if (!level || !levels[level as keyof typeof levels]) {
      bot.answerCallbackQuery(query.id, { text: '❌ Invalid level selected' });
      return;
    }

    const selectedLevel = levels[level as keyof typeof levels];

    // Answer the callback query to remove loading state
    bot.answerCallbackQuery(query.id, { text: `Generating ${selectedLevel.name} response...` });

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

      // Build context from gender dynamics
      let contextPrompt = '';
      if (session.userGender && session.targetGender) {
        if (!isHomies) {
          // Opposite sex - romantic personas (Regina George / Mr. Gray energy)
          if (session.userGender === 'woman' && session.targetGender === 'man') {
            contextPrompt += 'You are a REGINA GEORGE level queen. Cold, calculating, devastatingly hot, and you KNOW it. ';
          } else if (session.userGender === 'man' && session.targetGender === 'woman') {
            contextPrompt += 'You are a MR. GRAY level alpha. Dominant, mysterious, cocky confidence. You run the game. ';
          }
        } else {
          // Same gender - homies energy
          contextPrompt += 'You are texting your HOMIE. Bros being bros. Keep it real, no romance vibes. ';
        }
      }

      const fullPrompt = contextPrompt + selectedLevel.prompt + ' ' + languageInstruction;

      // Get chat history for context
      const chatHistory = db.getChatHistory(chatId);

      const response = await generateResponse(session.messageText, fullPrompt, chatHistory);

      // Store response in session (DON'T save to history yet - let user decide)
      session.lastResponse = response;
      session.lastLevel = level;

      // Send the generated response with action buttons
      const sentMessage = await bot.sendMessage(
        chatId,
        `${selectedLevel.name}\n\n"${response}"`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Keep This', callback_data: 'keep_response' },
                { text: '🔄 Try Another', callback_data: 'retry_response' }
              ]
            ]
          }
        }
      );

      // Store the response message ID
      session.responseMessageId = sentMessage.message_id;

      // Edit the loading message to show success
      const successMessage = getMessage(user.language as LanguageCode, 'success');
      bot.editMessageText(
        successMessage,
        {
          chat_id: chatId,
          message_id: messageId
        }
      );

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
async function generateResponse(messageText: string, systemPrompt: string, chatHistory: Array<{role: 'user' | 'assistant', content: string}>): Promise<string> {
  const messages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [
    {
      role: 'system',
      content: systemPrompt
    }
  ];

  // Add chat history for context (last 8 messages)
  const recentHistory = chatHistory.slice(-8);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role,
      content: msg.content
    });
  }

  // Add current message
  messages.push({
    role: 'user',
    content: messageText
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages,
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
