import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Search, Menu, Send, Cat } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MessageRow {
  id: number;
  userId: number;
  role: "user" | "assistant";
  content: string;
  messageType: "text" | "gif";
  createdAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatKoreanDate(date: Date): string {
  const days = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const day = days[date.getDay()];
  return `${y}년 ${m}월 ${d}일 ${day}`;
}

function formatTime(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, "0");
  const ampm = h < 12 ? "오전" : "오후";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${hour}:${m}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

// Cat GIF URLs (Tenor public GIFs)
const CAT_GIFS = [
  "https://media.tenor.com/images/fb0f9e5c6e5f9c6c6e5f9c6c6e5f9c6c/tenor.gif",
  "https://media2.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif",
  "https://media2.giphy.com/media/vFKqnCdLPNOKc/giphy.gif",
  "https://media2.giphy.com/media/mlvseq9yvZhba/giphy.gif",
  "https://media2.giphy.com/media/BzyTuYCmvSORqs1ABM/giphy.gif",
  "https://media2.giphy.com/media/ICOgUNjpvO0PC/giphy.gif",
  "https://media2.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif",
  "https://media2.giphy.com/media/ule4vhcY1xEKQ/giphy.gif",
];

function getRandomCatGif(): string {
  return CAT_GIFS[Math.floor(Math.random() * CAT_GIFS.length)];
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function DateDivider({ date }: { date: Date }) {
  return (
    <div className="flex items-center justify-center my-4 px-4">
      <span className="date-divider-text">{formatKoreanDate(date)}</span>
    </div>
  );
}

function TypingIndicator({ partnerName }: { partnerName: string }) {
  return (
    <div className="flex items-end gap-2 px-4 py-1 msg-enter">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-300 to-rose-400 flex items-center justify-center text-white text-sm font-bold shrink-0">
        {partnerName.charAt(0)}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-gray-600 font-medium mb-1">{partnerName}</span>
        <div className="bubble-other px-4 py-3 flex items-center gap-1.5">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  partnerName,
  showAvatar,
  showTime,
}: {
  msg: MessageRow;
  partnerName: string;
  showAvatar: boolean;
  showTime: boolean;
}) {
  const isMe = msg.role === "user";
  const time = formatTime(msg.createdAt);

  if (isMe) {
    return (
      <div className="flex justify-end items-end gap-1.5 px-4 py-0.5 msg-enter">
        <div className="flex flex-col items-end gap-0.5 max-w-[72%]">
          {showTime && <span className="text-[10px] text-gray-500 mr-1">{time}</span>}
          {msg.messageType === "gif" ? (
            <img
              src={msg.content}
              alt="cat gif"
              className="rounded-2xl max-w-[200px] max-h-[200px] object-cover shadow-md"
              loading="lazy"
            />
          ) : (
            <div className="bubble-me px-3.5 py-2.5 text-sm leading-relaxed break-words">
              {msg.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 px-4 py-0.5 msg-enter">
      {/* Avatar placeholder for alignment */}
      <div className="w-9 shrink-0">
        {showAvatar && (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-300 to-rose-400 flex items-center justify-center text-white text-sm font-bold">
            {partnerName.charAt(0)}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 max-w-[72%]">
        {showAvatar && (
          <span className="text-xs text-gray-600 font-medium mb-0.5">{partnerName}</span>
        )}
        <div className="flex items-end gap-1.5">
          {msg.messageType === "gif" ? (
            <img
              src={msg.content}
              alt="cat gif"
              className="rounded-2xl max-w-[200px] max-h-[200px] object-cover shadow-md"
              loading="lazy"
            />
          ) : (
            <div className="bubble-other px-3.5 py-2.5 text-sm leading-relaxed break-words">
              {msg.content}
            </div>
          )}
          {showTime && <span className="text-[10px] text-gray-500 shrink-0">{time}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Main Chat Component ──────────────────────────────────────────────────────
interface ChatProps {
  partnerName: string;
}

export default function Chat({ partnerName }: ChatProps) {
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<MessageRow[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [pendingReplyAt, setPendingReplyAt] = useState<Date | null>(null);
  const [isSending, setIsSending] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const utils = trpc.useUtils();

  // Load messages from DB
  const { data: dbMessages } = trpc.chat.getMessages.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Sync DB messages to local state
  useEffect(() => {
    if (dbMessages) {
      const now = new Date();
      // Only show messages with createdAt <= now (hide future-scheduled AI replies)
      const visible = dbMessages.filter((m) => new Date(m.createdAt) <= now);
      setLocalMessages(visible as MessageRow[]);

      // Check if there's a pending AI reply scheduled in the future
      const futureAI = dbMessages.find(
        (m) => m.role === "assistant" && new Date(m.createdAt) > now
      );
      if (futureAI) {
        setPendingReplyAt(new Date(futureAI.createdAt));
        setIsTyping(true);
      }
    }
  }, [dbMessages]);

  // Poll for pending reply
  useEffect(() => {
    if (!pendingReplyAt) return;

    const now = new Date();
    const msUntilReply = pendingReplyAt.getTime() - now.getTime();

    if (msUntilReply <= 0) {
      // Already ready
      setIsTyping(false);
      setPendingReplyAt(null);
      utils.chat.getMessages.invalidate();
      return;
    }

    // Set timer to reveal reply
    pollTimerRef.current = setTimeout(() => {
      setIsTyping(false);
      setPendingReplyAt(null);
      utils.chat.getMessages.invalidate();
    }, msUntilReply);

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [pendingReplyAt, utils]);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [localMessages, isTyping, scrollToBottom]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  };

  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: (data) => {
      const replyAt = new Date(data.replyAt);
      setPendingReplyAt(replyAt);
      setIsTyping(true);
      utils.chat.getMessages.invalidate();
      setIsSending(false);
    },
    onError: () => {
      setIsSending(false);
    },
  });

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setIsSending(true);

    // Optimistic: add user message locally
    const optimisticMsg: MessageRow = {
      id: Date.now(),
      userId: 0,
      role: "user",
      content: text,
      messageType: "text",
      createdAt: new Date(),
    };
    setLocalMessages((prev) => [...prev, optimisticMsg]);

    sendMessage.mutate({ content: text, messageType: "text" });
  };

  const handleCatGif = async () => {
    if (isSending) return;
    const gifUrl = getRandomCatGif();
    setIsSending(true);

    const optimisticMsg: MessageRow = {
      id: Date.now(),
      userId: 0,
      role: "user",
      content: gifUrl,
      messageType: "gif",
      createdAt: new Date(),
    };
    setLocalMessages((prev) => [...prev, optimisticMsg]);

    sendMessage.mutate({ content: gifUrl, messageType: "gif", notifyOwner: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Build render list with date dividers
  const renderItems: Array<
    | { type: "date"; date: Date; key: string }
    | { type: "message"; msg: MessageRow; showAvatar: boolean; showTime: boolean; key: string }
  > = [];

  let lastDate: Date | null = null;
  for (let i = 0; i < localMessages.length; i++) {
    const msg = localMessages[i];
    const msgDate = new Date(msg.createdAt);

    if (!lastDate || !isSameDay(lastDate, msgDate)) {
      renderItems.push({ type: "date", date: msgDate, key: `date-${msg.id}` });
      lastDate = msgDate;
    }

    const next = localMessages[i + 1];
    const showAvatar = msg.role === "assistant" &&
      (i === 0 || localMessages[i - 1].role !== "assistant");
    const showTime = !next || new Date(next.createdAt).getTime() - msgDate.getTime() > 60000 ||
      next.role !== msg.role;

    renderItems.push({ type: "message", msg, showAvatar, showTime, key: `msg-${msg.id}` });
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#121212] px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex h-full w-full max-w-[430px] overflow-hidden rounded-[30px] border border-white/10 bg-[#B2C8BA] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <div className="flex h-full w-full flex-col">
          {/* ── Header ── */}
          <div className="chat-header safe-top z-10 flex shrink-0 items-center gap-2 px-3 py-2">
            <button className="rounded-full p-2 transition-colors hover:bg-black/10">
              <ChevronLeft className="h-6 w-6 text-gray-700" />
            </button>
            <div className="flex flex-1 items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-pink-300 to-rose-400 text-sm font-bold text-white shadow-sm">
                {partnerName.charAt(0)}
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-gray-500">
                  LONGDILONG CHAT
                </p>
                <p className="text-sm font-semibold leading-tight text-gray-800">{partnerName}</p>
                <p className="text-[11px] text-green-700">챗봇과 연결됨</p>
              </div>
            </div>
            <button className="rounded-full p-2 transition-colors hover:bg-black/10">
              <Search className="h-5 w-5 text-gray-700" />
            </button>
            <button className="rounded-full p-2 transition-colors hover:bg-black/10">
              <Menu className="h-5 w-5 text-gray-700" />
            </button>
          </div>

          {/* ── Messages ── */}
          <div className="chat-bg flex-1 overflow-y-auto scrollbar-hide py-2">
            {renderItems.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center px-8 text-center">
                <p className="text-[11px] font-semibold tracking-[0.18em] text-gray-600">
                  START TALKING
                </p>
                <p className="mt-2 text-sm leading-relaxed text-gray-700">
                  첫 메시지를 보내면
                  <br />
                  {partnerName} 챗봇이 천천히 답장을 준비해요.
                </p>
              </div>
            ) : (
              <>
                {renderItems.map((item) => {
                  if (item.type === "date") {
                    return <DateDivider key={item.key} date={item.date} />;
                  }
                  return (
                    <MessageBubble
                      key={item.key}
                      msg={item.msg}
                      partnerName={partnerName}
                      showAvatar={item.showAvatar}
                      showTime={item.showTime}
                    />
                  );
                })}
              </>
            )}

            {isTyping && <TypingIndicator partnerName={partnerName} />}
            <div ref={messagesEndRef} className="h-2" />
          </div>

          {/* ── Input toolbar ── */}
          <div className="safe-bottom shrink-0 border-t border-gray-200 bg-[#F5F5F5]/95 backdrop-blur-sm">
            <div className="flex items-end gap-2 px-3 py-3">
              {/* Cat GIF button */}
              <button
                onClick={handleCatGif}
                disabled={isSending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition-all hover:bg-yellow-50 active:scale-95 disabled:opacity-50"
                title="고양이 신호 보내기"
              >
                <Cat className="h-5 w-5 text-gray-600" />
              </button>

              {/* Text input */}
              <div className="flex flex-1 items-end gap-2 rounded-[22px] border border-gray-200 bg-white px-3.5 py-2 shadow-sm">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="메시지를 입력하세요..."
                  className="auto-resize-textarea flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
                  rows={1}
                />
              </div>

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!input.trim() || isSending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FEE500] shadow-sm transition-all hover:bg-[#F5D800] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4 text-gray-700" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
