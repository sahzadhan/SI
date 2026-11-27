# Shahzad Intelligence — Android full-feature starter

This project includes an Android app UI and backend routes for the requested feature set.

## Included in the project
- AI chat with conversation context
- Speech-to-text voice input (native Android speech recognition)
- Text-to-speech playback for assistant replies
- PDF text extraction and AI analysis
- Image understanding using a vision-capable chat model
- Image editing through the OpenAI Images API
- Web search through Tavily, followed by an AI summary
- Liquid-glass-inspired dark UI, gradient controls, typing indicator, attachment chips

## Important limitations / setup
This is a feature-integrated source project, not a ready-installed APK. External AI services require accounts/API keys and may charge or impose free-tier limits. No provider key is bundled. Never put secret keys in the Android app.

Image editing requires an OpenAI API key and image API access. Chat/image understanding require a chat provider that supports OpenAI-compatible `/chat/completions` and vision image inputs. Web search requires a Tavily key. PDF extraction currently handles text PDFs; scanned/image-only PDFs need OCR, which is not configured in this starter.

The voice-recognition native module requires an Expo development build; it will not run in standard Expo Go. Text-to-speech uses Expo Speech.

## Backend setup
1. Install Node.js on your computer.
2. Open terminal in `server/`.
3. Copy `.env.example` to `.env`.
4. Fill in the provider credentials and model names.
5. Run:
   ```bash
   npm install
   npm start
   ```

## Android app setup
1. Install Node.js.
2. In project root:
   ```bash
   npm install
   npx expo install --check
   ```
3. For native voice recognition, create a development build:
   ```bash
   npx expo prebuild
   npx expo run:android
   ```
   Or configure EAS Build for Android.
4. Set `src/config.ts`:
   - Android emulator: `http://10.0.2.2:3001`
   - Physical phone: use your computer's LAN IP, e.g. `http://192.168.1.10:3001`, with both devices on the same Wi-Fi.
5. Start Metro with `npx expo start --dev-client`.

## Project structure
- `App.tsx` — Android UI and feature controls
- `src/config.ts` — backend address
- `server/index.js` — chat, PDF, image understanding, web search and image editing endpoints
- `server/.env.example` — secret configuration template
