'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { 
  X, 
  Send, 
  CalendarCheck,
  MessageCircle,
  Sparkles
} from 'lucide-react';

interface Message {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  time: string;
  quickActions?: { label: string; href?: string }[];
}

export const ChatAssistantWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'bot',
      text: 'As-salamu alaykum! Welcome to the Hifzoon Admissions Desk. How can we help your family with Quranic learning today?',
      time: 'Just now',
      quickActions: [
        { label: 'Book a Free 30-Min Evaluation', href: '/book-trial' },
        { label: 'What age can children start?' },
        { label: 'Can we request a female teacher (Ustadha)?' }
      ]
    }
  ]);

  const handleSend = (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text,
      time: 'Just now'
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');

    setTimeout(() => {
      let botResponse = 'Thank you for asking! We offer free 1-on-1 evaluation classes with vetted scholars:';
      let actions = [{ label: 'Schedule Free Trial Evaluation', href: '/book-trial' }];

      const lower = text.toLowerCase();
      if (lower.includes('age') || lower.includes('kids') || lower.includes('child')) {
        botResponse = 'Our Noorani & Madani Qaida program is specifically designed for children aged 4–9. We use an interactive digital board with gentle phonetics, zero pressure, and patient teachers.';
      } else if (lower.includes('female') || lower.includes('sister') || lower.includes('ustadha') || lower.includes('daughter')) {
        botResponse = 'Yes! We have qualified, verified female scholars (Ustadha) for young girls and adult sisters. You can select your gender preference during booking.';
      } else if (lower.includes('price') || lower.includes('cost') || lower.includes('tuition')) {
        botResponse = 'Tuition starts from $38/month for small Halqas and $48/month for private 1-on-1 classes, with an automatic 15% sibling discount.';
        actions = [{ label: 'View Tuition & Sibling Policy', href: '/pricing' }];
      }

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: botResponse,
        time: 'Just now',
        quickActions: actions
      };

      setMessages((prev) => [...prev, botMsg]);
    }, 450);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Modern Floating Launcher Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="relative w-14 h-14 rounded-full bg-gradient-to-br from-[#12362c] to-[#0a1f19] border-2 border-[#c49a55] shadow-[0_12px_32px_rgba(0,0,0,0.45)] hover:shadow-[0_16px_40px_rgba(196,154,85,0.4)] flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 group cursor-pointer"
          aria-label="Open Admissions Assistant"
        >
          {/* Logo with matching gold arch container */}
          <div className="relative w-8 h-8 rounded-t-[12px] rounded-b-[4px] bg-[#c49a55] p-1 flex items-center justify-center shrink-0 shadow-inner">
            <Image
              src="/logo.png"
              alt="Hifzoon"
              width={32}
              height={32}
              className="object-contain w-full h-full"
            />
          </div>

          {/* Pulsing Live Online Status Indicator */}
          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-[#0a1f19]" />
          </span>

          {/* Elegant Hover Tooltip */}
          <span className="hidden sm:inline-flex items-center gap-1.5 absolute right-full mr-3.5 px-3 py-1.5 rounded-full bg-[#0a1f19] text-white text-xs font-medium border border-[#c49a55]/40 shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <span>Admissions Desk</span>
            <span className="text-[#c49a55] font-semibold">· Online</span>
          </span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="w-[340px] sm:w-[380px] h-[510px] bg-white rounded-[24px] shadow-2xl border border-[#e6dfd1] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-[#0f2c24] p-4 text-white flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="relative w-9 h-9 rounded-t-[14px] rounded-b-[5px] bg-[#c49a55] p-1 flex items-center justify-center shrink-0 shadow-xs">
                <Image
                  src="/logo.png"
                  alt="Hifzoon Logo"
                  width={36}
                  height={36}
                  className="object-contain w-full h-full"
                />
              </div>
              <div>
                <h4 className="text-sm font-fraunces font-medium text-white flex items-center gap-1.5">
                  <span>Hifzoon Admissions</span>
                  <Sparkles className="w-3.5 h-3.5 text-[#c49a55]" />
                </h4>
                <div className="flex items-center gap-1.5 text-[11px] text-[#c4d3cd]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Online · Academic Advisor</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[#c4d3cd] hover:text-white hover:bg-white/20 transition-colors"
              aria-label="Close Admissions Chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Body */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-[#faf7f1] text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-[18px] p-3.5 leading-relaxed text-[13px] shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-[#143a2f] text-white rounded-br-none'
                      : 'bg-white text-[#10201b] border border-[#e6dfd1] rounded-bl-none'
                  }`}
                >
                  <p>{msg.text}</p>

                  {/* Quick Action Suggestions */}
                  {msg.quickActions && (
                    <div className="mt-3 pt-2.5 border-t border-[#f3eee4] flex flex-col gap-1.5">
                      {msg.quickActions.map((qa, i) => (
                        qa.href ? (
                          <Link
                            key={i}
                            href={qa.href}
                            onClick={() => setIsOpen(false)}
                            className="inline-flex items-center justify-between px-3 py-2 rounded-xl bg-[#c49a55] text-[#0a1f19] font-semibold text-xs hover:bg-[#b58c49] transition-colors shadow-2xs"
                          >
                            <span>{qa.label}</span>
                            <CalendarCheck className="w-3.5 h-3.5 text-[#0a1f19]" />
                          </Link>
                        ) : (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSend(qa.label)}
                            className="text-left px-3 py-1.5 rounded-xl bg-[#f0f6f3] text-[#143a2f] border border-[#e6dfd1] text-xs font-medium hover:bg-[#e6dfd1] transition-colors cursor-pointer"
                          >
                            {qa.label}
                          </button>
                        )
                      ))}
                    </div>
                  )}

                  <span className={`block text-[10px] text-right mt-1.5 ${
                    msg.sender === 'user' ? 'text-white/60' : 'text-[#6b7772]'
                  }`}>
                    {msg.time}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Input Footer */}
          <div className="p-3 bg-white border-t border-[#e6dfd1] flex items-center gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about courses, faculty, trial..."
              className="flex-1 px-4 py-2 text-xs rounded-full bg-[#f3eee4] border border-[#e6dfd1] focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b] placeholder:text-[#6b7772]"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              className="w-9 h-9 rounded-full bg-[#143a2f] hover:bg-[#0f2c24] text-white flex items-center justify-center transition-colors cursor-pointer shadow-sm active:scale-95"
              aria-label="Send Message"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
