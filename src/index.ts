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
  userGender?: 'man' | 'woman' | 'other';
  targetGender?: 'man' | 'woman' | 'other';
  intent?: 'hookup' | 'friendzone' | 'longterm';
  tone?: 'dirty' | 'flirty' | 'balanced' | 'cheesy' | 'pure';
}

const userSessions = new Map<number, UserSession>();

// Response levels configuration
const responseLevels = {
  '1': {
    name: '💪 Witty & Confident',
    description: 'Sharp, witty, and supremely confident',
    prompt: 'Text like a witty, confident Gen Z who owns every conversation. Be clever and sharp with your words. Use lowercase, no punctuation, text slang (fr, ngl, lowkey). ONE SHORT TEXT MESSAGE ONLY (max 10-15 words). Witty comeback energy. Add 💪 if it fits.'
  },
  '2': {
    name: '😎 Bold & Direct',
    description: 'Bold, direct, and no-nonsense',
    prompt: 'Text like a bold confident Gen Z. Be direct, assertive, and straightforward. Use lowercase, abbreviations (ur, bc, ngl, tbh), no punctuation. ONE SHORT direct text (max 10-15 words). Get to the point with confidence. Add 😎 if it fits.'
  },
  '3': {
    name: '😏 Rizz Master',
    description: 'Smooth, charming, irresistible',
    prompt: 'Text like a smooth confident Gen Z with infinite rizz. Use lowercase, casual slang (nah, bet, lowkey), emojis (😏😉). Make it SUPER short and smooth (max 10-15 words). Confident and playful. ONE text message only.'
  },
  '4': {
    name: '💕 Fun & Flirty',
    description: 'Playful, flirty, and charming',
    prompt: 'Text like a flirty Gen Z. Lowercase, cute emojis (💕😊✨), casual language (haha, omg, lowkey). Keep it SHORT and playful (max 10-15 words). Tease them a bit. ONE quick flirty text only.'
  },
  '5': {
    name: '💝 Compassionate & Kind',
    description: 'Warm, caring, and genuine',
    prompt: 'Text like a sweet supportive Gen Z friend. Use lowercase, caring emojis (🤗💙💝), casual warm language (aww, youre ok, its gonna be fine). Super SHORT and kind (max 10-15 words). ONE comforting text message.'
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

// Handle /configure command
bot.onText(/\/configure/, (msg) => {
  const chatId = msg.chat.id;

  let user = db.getUser(chatId);
  if (!user) {
    user = db.createUser(chatId, msg.from?.username);
  }

  const currentPrefs = user.userGender && user.targetGender && user.intent && user.tone
    ? `\n\n*Current Settings:*\n• Your gender: ${user.userGender}\n• Texting: ${user.targetGender}\n• Intent: ${user.intent}\n• Tone: ${user.tone}`
    : '\n\n*Not configured yet*';

  // Clear their stored preferences so they'll be asked again on next message
  db.updateUser(chatId, {
    userGender: undefined,
    targetGender: undefined,
    intent: undefined,
    tone: undefined
  });

  bot.sendMessage(
    chatId,
    `⚙️ *Response Configuration*${currentPrefs}\n\n✅ *Preferences cleared!*\n\nSend or forward a message now and you'll be asked to reconfigure your preferences.`,
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

  // Check if user has configured preferences
  if (!user.userGender || !user.targetGender || !user.intent || !user.tone) {
    // User needs to configure - start configuration flow
    const configKeyboard = {
      inline_keyboard: [
        [{ text: '⚙️ Configure Preferences', callback_data: 'config_start' }],
        [{ text: '⏭️ Skip (use defaults)', callback_data: 'config_skip' }]
      ]
    };

    bot.sendMessage(
      chatId,
      '⚙️ *Configure Your Response Style*\n\nFor the best results, tell me a bit about your situation! This only takes 10 seconds.\n\nOr skip to use balanced defaults.',
      { parse_mode: 'Markdown', reply_markup: configKeyboard }
    );
    return;
  }

  // Copy user preferences to session
  const session = userSessions.get(chatId);
  if (session) {
    session.userGender = user.userGender;
    session.targetGender = user.targetGender;
    session.intent = user.intent;
    session.tone = user.tone;
  }

  // Create inline keyboard with response levels
  const keyboard = {
    inline_keyboard: [
      [{ text: responseLevels['1'].name, callback_data: 'level_1' }],
      [{ text: responseLevels['2'].name, callback_data: 'level_2' }],
      [{ text: responseLevels['3'].name, callback_data: 'level_3' }],
      [{ text: responseLevels['4'].name, callback_data: 'level_4' }],
      [{ text: responseLevels['5'].name, callback_data: 'level_5' }]
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

  // Handle configuration flow
  if (data === 'config_start' || data === 'config_skip') {
    const session = userSessions.get(chatId);
    if (!session) {
      bot.answerCallbackQuery(query.id, { text: '❌ Session expired. Send message again.' });
      return;
    }

    if (data === 'config_skip') {
      // Set defaults
      session.userGender = 'other';
      session.targetGender = 'other';
      session.intent = 'friendzone';
      session.tone = 'balanced';

      db.updateUser(chatId, {
        userGender: 'other',
        targetGender: 'other',
        intent: 'friendzone',
        tone: 'balanced'
      });

      bot.answerCallbackQuery(query.id, { text: '✅ Using balanced defaults' });

      // Show response levels
      const keyboard = {
        inline_keyboard: [
          [{ text: responseLevels['1'].name, callback_data: 'level_1' }],
          [{ text: responseLevels['2'].name, callback_data: 'level_2' }],
          [{ text: responseLevels['3'].name, callback_data: 'level_3' }],
          [{ text: responseLevels['4'].name, callback_data: 'level_4' }],
          [{ text: responseLevels['5'].name, callback_data: 'level_5' }]
        ]
      };

      const user = db.getUser(chatId);
      const chooseMessage = getMessage(user?.language as LanguageCode || 'en', 'chooseLevel');
      bot.editMessageText(chooseMessage, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard
      });
      return;
    }

    // Start configuration - ask for gender
    const genderKeyboard = {
      inline_keyboard: [
        [{ text: '👨 Man', callback_data: 'gender_man' }],
        [{ text: '👩 Woman', callback_data: 'gender_woman' }],
        [{ text: '🌈 Other', callback_data: 'gender_other' }]
      ]
    };

    bot.answerCallbackQuery(query.id);
    bot.editMessageText('👤 *Step 1/4: Your Gender*\n\nI am a...', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: genderKeyboard
    });
    return;
  }

  // Handle gender selection
  if (data.startsWith('gender_')) {
    const gender = data.replace('gender_', '') as 'man' | 'woman' | 'other';
    const session = userSessions.get(chatId);
    if (!session) {
      bot.answerCallbackQuery(query.id, { text: '❌ Session expired' });
      return;
    }

    session.userGender = gender;
    bot.answerCallbackQuery(query.id);

    // Ask for target gender
    const targetKeyboard = {
      inline_keyboard: [
        [{ text: '👨 Man', callback_data: 'target_man' }],
        [{ text: '👩 Woman', callback_data: 'target_woman' }],
        [{ text: '🌈 Other', callback_data: 'target_other' }]
      ]
    };

    bot.editMessageText('💬 *Step 2/4: Who are you texting?*\n\nTexting a...', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: targetKeyboard
    });
    return;
  }

  // Handle target gender selection
  if (data.startsWith('target_')) {
    const target = data.replace('target_', '') as 'man' | 'woman' | 'other';
    const session = userSessions.get(chatId);
    if (!session) {
      bot.answerCallbackQuery(query.id, { text: '❌ Session expired' });
      return;
    }

    session.targetGender = target;
    bot.answerCallbackQuery(query.id);

    // Ask for intent
    const intentKeyboard = {
      inline_keyboard: [
        [{ text: '🔥 Hook up / Casual', callback_data: 'intent_hookup' }],
        [{ text: '💍 Long-term / Serious', callback_data: 'intent_longterm' }],
        [{ text: '🤝 Just friends', callback_data: 'intent_friendzone' }]
      ]
    };

    bot.editMessageText('🎯 *Step 3/4: Your Intent*\n\nWhat\'s your goal?', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: intentKeyboard
    });
    return;
  }

  // Handle intent selection
  if (data.startsWith('intent_')) {
    const intent = data.replace('intent_', '') as 'hookup' | 'friendzone' | 'longterm';
    const session = userSessions.get(chatId);
    if (!session) {
      bot.answerCallbackQuery(query.id, { text: '❌ Session expired' });
      return;
    }

    session.intent = intent;
    bot.answerCallbackQuery(query.id);

    // Ask for tone
    const toneKeyboard = {
      inline_keyboard: [
        [{ text: '🌶️ Dirty Talk', callback_data: 'tone_dirty' }],
        [{ text: '😏 Flirty', callback_data: 'tone_flirty' }],
        [{ text: '💬 Balanced', callback_data: 'tone_balanced' }],
        [{ text: '🧀 Cheesy', callback_data: 'tone_cheesy' }],
        [{ text: '💝 Pure/Sweet', callback_data: 'tone_pure' }]
      ]
    };

    bot.editMessageText('🎨 *Step 4/4: Tone*\n\nHow should I respond?', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: toneKeyboard
    });
    return;
  }

  // Handle tone selection
  if (data.startsWith('tone_')) {
    const tone = data.replace('tone_', '') as 'dirty' | 'flirty' | 'balanced' | 'cheesy' | 'pure';
    const session = userSessions.get(chatId);

    // Get temporary config data from previous selections
    // For reconfiguration without active session, we need to track state differently
    // For now, we'll require the configuration to happen within a message session
    if (!session) {
      // This is a standalone reconfiguration - just save the tone selection
      // We need to track the previous selections somehow
      // For simplicity, let's require users to send a message first
      bot.answerCallbackQuery(query.id, { text: '❌ Please send a message first to configure.' });
      bot.editMessageText(
        '❌ Configuration incomplete.\n\nPlease send or forward a message first, then configure your preferences.',
        { chat_id: chatId, message_id: messageId }
      );
      return;
    }

    session.tone = tone;

    // Save preferences to database
    db.updateUser(chatId, {
      userGender: session.userGender,
      targetGender: session.targetGender,
      intent: session.intent,
      tone: session.tone
    });

    bot.answerCallbackQuery(query.id, { text: '✅ Preferences saved!' });

    // Show response levels
    const keyboard = {
      inline_keyboard: [
        [{ text: responseLevels['1'].name, callback_data: 'level_1' }],
        [{ text: responseLevels['2'].name, callback_data: 'level_2' }],
        [{ text: responseLevels['3'].name, callback_data: 'level_3' }],
        [{ text: responseLevels['4'].name, callback_data: 'level_4' }],
        [{ text: responseLevels['5'].name, callback_data: 'level_5' }]
      ]
    };

    const user = db.getUser(chatId);
    const chooseMessage = getMessage(user?.language as LanguageCode || 'en', 'chooseLevel');
    bot.editMessageText(chooseMessage, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: keyboard
    });
    return;
  }

  // Handle response level selection
  if (data.startsWith('level_')) {
    const level = data.replace('level_', '') as keyof typeof responseLevels;

    if (!level || !responseLevels[level]) {
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
    bot.answerCallbackQuery(query.id, { text: `Generating ${responseLevels[level].name} response...` });

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

      // Build context from user preferences
      let contextPrompt = '';
      if (session.userGender && session.targetGender) {
        const genderContext = session.userGender === 'other' ? 'person' : session.userGender;
        const targetContext = session.targetGender === 'other' ? 'person' : session.targetGender;
        contextPrompt += `You are a ${genderContext} texting a ${targetContext}. `;
      }

      if (session.intent) {
        const intentMap = {
          hookup: 'Your goal is casual/flirty hookup vibes.',
          longterm: 'Your goal is serious relationship material.',
          friendzone: 'Keep it friendly and platonic.'
        };
        contextPrompt += intentMap[session.intent] + ' ';
      }

      if (session.tone) {
        const toneMap = {
          dirty: 'Use DIRTY, suggestive language.',
          flirty: 'Be flirty and playful.',
          balanced: 'Keep it balanced and natural.',
          cheesy: 'Go EXTRA cheesy with romantic lines.',
          pure: 'Be wholesome, pure, and sweet.'
        };
        contextPrompt += toneMap[session.tone] + ' ';
      }

      const fullPrompt = contextPrompt + responseLevels[level].prompt + ' ' + languageInstruction;

      const response = await generateResponse(session.messageText, fullPrompt);

      // Increment message count
      db.incrementMessageCount(chatId);

      // Send the generated response
      bot.sendMessage(
        chatId,
        `${responseLevels[level].name}\n\n"${response}"`,
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
