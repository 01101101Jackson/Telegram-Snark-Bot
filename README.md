# 🤖 Telegram Toxic Response Bot

A Telegram bot that generates AI-powered responses at various "toxic" levels. Users can forward messages to the bot and choose from 5 different response styles ranging from highly toxic to compassionate.

## ✨ Features

- **5 Response Levels:**
  - 💀 **Highly Vindictive & Toxic** - Ruthless, dominating, and devastating
  - 🔥 **Toxic & Direct** - Harsh, blunt, and cutting
  - 😎 **Rizz Master** - Smooth, charming, and confident lady killer
  - 💕 **Fun & Flirty** - Playful, teasing, and lighthearted
  - 🤗 **Compassionate & Kind** - Empathetic and supportive

- **Easy to Use:**
  - Simply send or forward any message
  - Select your desired response level
  - Get an AI-generated response instantly

- **Powered by OpenAI** - Uses GPT-3.5-turbo for intelligent response generation

## 🚀 Setup

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- OpenAI API Key

### Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd Telegram-Snark-Bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

4. **Configure environment variables:**

   Edit `.env` and add your credentials:
   ```env
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   OPENAI_API_KEY=your_openai_api_key_here
   ```

   **Getting a Telegram Bot Token:**
   - Open Telegram and search for [@BotFather](https://t.me/botfather)
   - Send `/newbot` and follow the instructions
   - Copy the token provided

   **Getting an OpenAI API Key:**
   - Go to [OpenAI API Keys](https://platform.openai.com/api-keys)
   - Create a new API key
   - Copy and save it securely

5. **Build the project:**
   ```bash
   npm run build
   ```

6. **Start the bot:**
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

## 📖 Usage

1. **Start a chat with your bot** on Telegram

2. **Send the `/start` command** to see the welcome message

3. **Send or forward any message** to the bot

4. **Choose your response level** from the buttons that appear

5. **Receive your AI-generated response!**

### Example Workflow

```
User: [Forwards message: "You're always late!"]
Bot: 🎯 Choose your response level:
     [Shows 5 buttons with different toxic levels]

User: [Clicks "😎 Rizz Master"]
Bot: ⏳ Generating your 😎 Rizz Master response...
Bot: 😎 Rizz Master

     "I'm not late, I'm just giving you more time to miss me. 😏"
```

## 🛠️ Development

### Project Structure

```
Telegram-Snark-Bot/
├── src/
│   └── index.ts          # Main bot logic
├── dist/                 # Compiled JavaScript (generated)
├── .env                  # Environment variables (not committed)
├── .env.example          # Environment template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

### Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled bot
- `npm run dev` - Run in development mode with ts-node
- `npm run watch` - Watch for changes and recompile

### Technologies Used

- **TypeScript** - Type-safe JavaScript
- **node-telegram-bot-api** - Telegram Bot API wrapper
- **OpenAI API** - AI response generation
- **dotenv** - Environment variable management

## ⚠️ Important Notes

- **Content Warning:** This bot generates responses that can be toxic, offensive, or inappropriate. Use responsibly and at your own discretion.
- **API Costs:** OpenAI API usage incurs costs. Monitor your usage at [OpenAI Usage](https://platform.openai.com/usage).
- **Rate Limits:** Be mindful of Telegram and OpenAI API rate limits.
- **Privacy:** Messages sent to the bot are processed by OpenAI. Don't send sensitive information.

## 🔒 Security

- Never commit your `.env` file or expose your API keys
- Keep your `TELEGRAM_BOT_TOKEN` and `OPENAI_API_KEY` secure
- Regularly rotate your API keys
- Monitor API usage for suspicious activity

## 📝 License

MIT License - Feel free to use and modify as needed.

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest new features
- Submit pull requests

## 💡 Tips

- Start with lower toxic levels to understand the bot's capabilities
- The bot works with both direct messages and forwarded messages
- Each response is unique and generated in real-time
- Responses are kept concise (1-2 sentences) for quick, witty replies

## 🆘 Troubleshooting

**Bot not responding:**
- Check if the bot is running
- Verify your `TELEGRAM_BOT_TOKEN` is correct
- Check console logs for errors

**OpenAI errors:**
- Verify your `OPENAI_API_KEY` is valid
- Check if you have API credits available
- Review OpenAI API status

**Build errors:**
- Run `npm install` to ensure all dependencies are installed
- Check TypeScript version compatibility
- Clear `dist/` folder and rebuild

---

Made with ❤️ and a little bit of toxicity 😈
