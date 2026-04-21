# LoveDist Chat - Project TODO

## Database & Backend
- [x] DB schema: messages table (id, userId, role, content, createdAt, isRead)
- [x] DB schema: user_settings table (userId, partnerName, speakingStyle, firstMessageAt)
- [x] tRPC router: chat.getMessages - fetch all messages for current user
- [x] tRPC router: chat.sendMessage - save user message and trigger AI reply
- [x] tRPC router: chat.getSettings - fetch onboarding settings
- [x] tRPC router: chat.saveSettings - save partner name and speaking style
- [x] LLM integration: build system prompt from partnerName + speakingStyle
- [x] Reply timing logic: 3-min delay for first week, random 1s–30min after
- [x] AI reply saved to DB after delay

## Frontend
- [x] Onboarding screen: input partner name and speaking style
- [x] KakaoTalk-style chat header (partner name, online status, back icon)
- [x] Chat bubble UI: user (right, yellow), AI partner (left, white)
- [x] Profile icon for AI partner in chat
- [x] Date divider: Korean format "2026년 4월 17일 금요일"
- [x] "typing..." indicator while waiting for AI reply
- [x] Cat GIF button next to input field
- [x] Cat GIF display in chat bubble when tapped
- [x] Auto-resizing textarea input
- [x] Touch and click event support (mobile-optimized)
- [x] Chat history restored from DB on app load
- [x] Scroll to bottom on new message
- [x] iPhone 16 Pro optimized layout (393×852px viewport, safe areas)

## Style
- [x] Purple-gray color palette (purple-gray #E3DEEE, gray backgrounds, white bubbles)
- [x] Global CSS variables and mobile-first responsive design
- [x] Smooth animations for message appearance
- [x] Safe area insets for iPhone notch/dynamic island

## Tests
- [x] Vitest: chat.sendMessage saves message to DB
- [x] Vitest: chat.getSettings returns correct settings
- [x] Vitest: reply timing logic (first week vs after)
