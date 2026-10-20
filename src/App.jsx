import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userCode, setUserCode] = useState('');
  const [targetCode, setTargetCode] = useState('');
  const [chatUser, setChatUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatId, setChatId] = useState(null);

  // ۱. لاگین ناشناس
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (!error) setUser(data.user);
      } else {
        setUser(session.user);
      }
      setLoading(false);
    };
    checkUser();
  }, []);

  // تولید کد اختصاصی
  const generateUniqueCode = async () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const { data } = await supabase.from('profiles').select('code').eq('code', code).maybeSingle();
    return data ? generateUniqueCode() : code;
  };

  // ۲. تنظیم کد
  useEffect(() => {
    const setupUserCode = async () => {
      if (user) {
        let localCode = localStorage.getItem('myChatCode');
        const { data, error } = await supabase.from('profiles').select('code').eq('id', user.id).maybeSingle();
        
        if (error) return console.error(error);

        if (!data) {
          if (!localCode) {
            localCode = await generateUniqueCode();
            localStorage.setItem('myChatCode', localCode);
          }
          await supabase.from('profiles').insert({ id: user.id, code: localCode });
          setUserCode(localCode);
        } else {
          setUserCode(data.code);
          localStorage.setItem('myChatCode', data.code);
        }
      }
    };
    setupUserCode();
  }, [user]);

  // جستجوی کاربر
  const handleSearch = async (e) => {
    e.preventDefault();
    const code = targetCode.trim().toUpperCase();
    if (code === userCode) return alert('این کد خودتان است!');
    
    const { data } = await supabase.from('profiles').select('id, code').eq('code', code).maybeSingle();
    
    if (data) {
      const newChatId = [user.id, data.id].sort().join('_');
      setChatUser({ uid: data.id, code: data.code });
      setChatId(newChatId);
    } else {
      alert('کاربری با این کد پیدا نشد.');
    }
  };

  // دریافت پیام‌ها (Real-time)
  useEffect(() => {
    if (!chatId) return;

    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();

    const channel = supabase
      .channel('chat-room')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [chatId]);

  // ارسال پیام
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId) return;
    
    const msgText = newMessage;
    setNewMessage('');

    await supabase.from('messages').insert({
      chat_id: chatId,
      sender_id: user.id,
      content: msgText,
    });
  };

  // کپی کردن کد
  const copyCode = () => {
    navigator.clipboard.writeText(userCode);
    alert('کد اختصاصی کپی شد!');
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>در حال اتصال...</div>;
  if (!user) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>در حال ساخت حساب...</div>;

  return (
    <div className="app-container">
      {/* هدر بالای سایت */}
      <header className="header">
        <h2>پیام‌رسان</h2>
        <div className="user-code-badge" onClick={copyCode} title="برای کپی کلیک کنید">
          {userCode || '...'}
        </div>
      </header>

      {/* اگر در صفحه چت نیستیم */}
      {!chatUser ? (
        <div className="empty-state">
          <div style={{ fontSize: '3rem', marginBottom: '20px' }}>💬</div>
          <h3>کد اختصاصی دوستتان را وارد کنید تا چت شروع شود</h3>
          <form className="search-box" onSubmit={handleSearch}>
            <input 
              placeholder="مثلاً: A3B4C5" 
              value={targetCode} 
              onChange={(e) => setTargetCode(e.target.value)} 
              maxLength={6}
            />
            <button type="submit">جستجو</button>
          </form>
        </div>
      ) : (
        /* صفحه چت */
        <div className="chat-container">
          <div className="chat-header">
            <h3>چت با {chatUser.code}</h3>
            <button className="back-btn" onClick={() => { setChatUser(null); setChatId(null); setMessages([]); }}>
              بستن ✕
            </button>
          </div>

          <div className="messages-area">
            {messages.map(msg => {
              const isMe = msg.sender_id === user.id;
              return (
                <div key={msg.id} className={`message-bubble ${isMe ? 'outgoing' : 'incoming'}`}>
                  {msg.content}
                </div>
              );
            })}
          </div>

          <form className="input-area" onSubmit={sendMessage}>
            <input 
              placeholder="پیام..." 
              value={newMessage} 
              onChange={(e) => setNewMessage(e.target.value)} 
            />
            <button type="submit" className="send-btn">
              {/* آیکون ارسال تلگرام */}
              <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;