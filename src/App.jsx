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

  // ۱. لاگین ناشناس و مدیریت وضعیت کاربر
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

  // تولید کد اختصاصی ۶ رقمی
  const generateUniqueCode = async () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const { data } = await supabase.from('profiles').select('code').eq('code', code).maybeSingle();
    return data ? generateUniqueCode() : code;
  };

  // ۲. تنظیم کد برای کاربر
  useEffect(() => {
    const setupUserCode = async () => {
      if (user) {
        let localCode = localStorage.getItem('myChatCode');
        
        // استفاده از maybeSingle برای جلوگیری از خطای 406 در کنسول
        const { data, error } = await supabase
          .from('profiles')
          .select('code')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.error('خطا در ارتباط با دیتابیس:', error);
          return;
        }

        if (!data) {
          // کاربر جدید است
          if (!localCode) {
            localCode = await generateUniqueCode();
            localStorage.setItem('myChatCode', localCode);
          }
          await supabase.from('profiles').insert({ id: user.id, code: localCode });
          setUserCode(localCode);
        } else {
          // کاربر از قبل وجود دارد
          setUserCode(data.code);
          localStorage.setItem('myChatCode', data.code);
        }
      }
    };
    setupUserCode();
  }, [user]);

  // جستجوی کاربر
  const handleSearch = async () => {
    const code = targetCode.trim().toUpperCase();
    if (code === userCode) return alert('این کد خودتان است!');
    
    // استفاده از maybeSingle در جستجو
    const { data, error } = await supabase
      .from('profiles')
      .select('id, code')
      .eq('code', code)
      .maybeSingle();
    
    if (data) {
      const newChatId = [user.id, data.id].sort().join('_');
      setChatUser({ uid: data.id, code: data.code });
      setChatId(newChatId);
    } else {
      alert('کاربری با این کد پیدا نشد.');
    }
  };

  // ۳. دریافت پیام‌ها به صورت لحظه‌ای (Real-time)
  useEffect(() => {
    if (!chatId) return;

    // گرفتن پیام‌های قبلی
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();

    // گوش دادن به پیام‌های جدید
    const channel = supabase
      .channel('chat-room')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  if (loading) return <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'Tahoma' }}>در حال اتصال به سرور...</div>;
  if (!user) return <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'Tahoma' }}>در حال ساخت حساب کاربری...</div>;

  // صفحه اصلی (داشبورد)
  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'Tahoma' }} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>پیام‌رسان ناشناس</h2>
      </div>
      
      <div style={{ background: '#f0f0f0', padding: '10px', borderRadius: '8px', marginBottom: '20px' }}>
        <p>کد اختصاصی شما: <strong style={{ fontSize: '20px', color: 'blue' }}>{userCode || 'در حال ساخت...'}</strong></p>
        <p style={{ fontSize: '12px', color: '#666' }}>این کد مخصوص همین مرورگر است. آن را به دوستانتان بدهید تا با شما چت کنند.</p>
      </div>
      
      {!chatUser && (
        <div style={{ background: '#e8f4f8', padding: '15px', borderRadius: '8px' }}>
          <h3>شروع چت جدید</h3>
          <input 
            placeholder="کد طرف مقابل را وارد کنید" 
            value={targetCode} 
            onChange={(e) => setTargetCode(e.target.value)} 
            style={{ padding: '8px', width: '60%', marginLeft: '10px' }}
          />
          <button onClick={handleSearch} style={{ padding: '8px 15px', cursor: 'pointer' }}>جستجو</button>
        </div>
      )}

      {chatUser && (
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '10px' }}>
          <h3>چت با {chatUser.code}</h3>
          <div style={{ border: '1px solid #ddd', height: '300px', overflowY: 'scroll', padding: '10px', marginBottom: '10px', background: '#fafafa' }}>
            {messages.map(msg => (
              <div key={msg.id} style={{ textAlign: msg.sender_id === user.id ? 'left' : 'right', margin: '5px 0' }}>
                <span style={{ background: msg.sender_id === user.id ? '#dcf8c6' : '#fff', padding: '8px 12px', borderRadius: '15px', display: 'inline-block', border: '1px solid #ddd' }}>
                  {msg.content}
                </span>
              </div>
            ))}
          </div>
          <form onSubmit={sendMessage} style={{ display: 'flex' }}>
            <input 
              style={{ flex: 1, padding: '8px' }} 
              value={newMessage} 
              onChange={(e) => setNewMessage(e.target.value)} 
              placeholder="پیام خود را بنویسید..." 
            />
            <button type="submit" style={{ padding: '8px 15px', marginRight: '10px', cursor: 'pointer' }}>ارسال</button>
          </form>
          <button onClick={() => { setChatUser(null); setChatId(null); setMessages([]); }} style={{ marginTop: '10px', cursor: 'pointer', background: '#ff4d4d', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '5px' }}>
            بستن چت
          </button>
        </div>
      )}
    </div>
  );
}

export default App;