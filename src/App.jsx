import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userCode, setUserCode] = useState('');
  const [userName, setUserName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
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

  // ۲. تنظیم کد و اسم برای کاربر
  useEffect(() => {
    const setupUserProfile = async () => {
      if (user) {
        let localCode = localStorage.getItem('myChatCode');
        const { data, error } = await supabase.from('profiles').select('code, username').eq('id', user.id).maybeSingle();
        
        if (error) return console.error(error);

        if (!data) {
          if (!localCode) {
            localCode = await generateUniqueCode();
            localStorage.setItem('myChatCode', localCode);
          }
          const { error: insertError } = await supabase.from('profiles').insert({ id: user.id, code: localCode });
          if (insertError) {
            const newCode = await generateUniqueCode();
            localStorage.setItem('myChatCode', newCode);
            await supabase.from('profiles').insert({ id: user.id, code: newCode });
            setUserCode(newCode);
          } else {
            setUserCode(localCode);
          }
        } else {
          setUserCode(data.code);
          setUserName(data.username || '');
          localStorage.setItem('myChatCode', data.code);
        }
      }
    };
    setupUserProfile();
  }, [user]);

  // ذخیره نام
  const saveName = async () => {
    if (!userName.trim()) return;
    await supabase.from('profiles').update({ username: userName }).eq('id', user.id);
    setIsEditingName(false);
  };

  // جستجوی کاربر
  const handleSearch = async (e) => {
    e.preventDefault();
    const code = targetCode.trim().toUpperCase();
    if (code === userCode) return alert('این کد خودتان است!');
    
    const { data } = await supabase.from('profiles').select('id, code, username').eq('code', code).maybeSingle();
    
    if (data) {
      const newChatId = [user.id, data.id].sort().join('_');
      setChatUser({ uid: data.id, code: data.code, name: data.username });
      setChatId(newChatId);
    } else {
      alert('کاربری با این کد پیدا نشد.');
    }
  };

  // ۳. دریافت پیام‌ها (Real-time)
  useEffect(() => {
    if (!chatId) return;

    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();

    // گوش دادن به پیام‌های جدید و حذف شده
    const channel = supabase
      .channel('chat-room')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => prev.filter((msg) => msg.id !== payload.old.id));
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

  // حذف پیام
  const deleteMessage = async (msgId) => {
    if (window.confirm('آیا از حذف این پیام مطمئن هستید؟')) {
      const { error } = await supabase.from('messages').delete().eq('id', msgId);
      if (error) {
        alert('خطا در حذف پیام!');
        console.error(error);
      } else {
        setMessages((prev) => prev.filter((msg) => msg.id !== msgId));
      }
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(userCode);
    alert('کد اختصاصی کپی شد!');
  };

  // فرمت کردن ساعت
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div className="loading-screen">در حال اتصال...</div>;
  if (!user) return <div className="loading-screen">در حال ساخت حساب...</div>;

  return (
    <div className="app-container">
      <header className="header">
        <div className="profile-section">
          {isEditingName ? (
            <div className="edit-name-box">
              <input 
                type="text" 
                value={userName} 
                onChange={(e) => setUserName(e.target.value)} 
                placeholder="اسم شما..."
                maxLength={15}
              />
              <button onClick={saveName}>ذخیره</button>
            </div>
          ) : (
            <h2 onClick={() => setIsEditingName(true)} style={{ cursor: 'pointer' }} title="برای تغییر اسم کلیک کنید">
              {userName ? userName : 'پیام‌رسان ✎'}
            </h2>
          )}
        </div>
        <div className="user-code-badge" onClick={copyCode} title="برای کپی کلیک کنید">
          {userCode || '...'}
        </div>
      </header>

      {!chatUser ? (
        <div className="empty-state">
          <div style={{ fontSize: '3rem', marginBottom: '20px' }}>💬</div>
          <h3>کد اختصاصی دوستتان را وارد کنید</h3>
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
        <div className="chat-container">
          <div className="chat-header">
            <h3>{chatUser.name ? chatUser.name : `چت با ${chatUser.code}`}</h3>
            <button className="back-btn" onClick={() => { setChatUser(null); setChatId(null); setMessages([]); }}>
              بستن ✕
            </button>
          </div>

          <div className="messages-area">
            {messages.map(msg => {
              const isMe = msg.sender_id === user.id;
              return (
                <div key={msg.id} className={`message-wrapper ${isMe ? 'outgoing' : 'incoming'}`}>
                  <div className={`message-bubble`}>
                    {msg.content}
                  </div>
                  
                  {/* بخش ساعت و دکمه حذف */}
                  <div className="message-info">
                    <span className="message-time">{formatTime(msg.created_at)}</span>
                    {isMe && (
                      <span className="delete-btn" onClick={() => deleteMessage(msg.id)} title="حذف پیام">
                        🗑️
                      </span>
                    )}
                  </div>
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
              <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;