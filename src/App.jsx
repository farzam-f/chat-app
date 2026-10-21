import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import imageCompression from 'browser-image-compression';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userCode, setUserCode] = useState('');
  const [userName, setUserName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  
  // استیت‌های مربوط به چت
  const [chatList, setChatList] = useState([]);
  const [isSearching, setIsSearching] = useState(false); // آیا باکس جستجو باز است؟
  const [targetCode, setTargetCode] = useState('');
  const [chatUser, setChatUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatId, setChatId] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  const fileInputRef = useRef(null);

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

  // ۲. تنظیم کد و اسم
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

  // ۳. گرفتن لیست چت‌ها
  const fetchChatList = async () => {
    if (!user) return;
    
    // گرفتن تمام پیام‌هایی که کاربر فرستاده یا دریافت کرده
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('chat_id, content, image_url, created_at')
      .like('chat_id', `%${user.id}%`)
      .order('created_at', { ascending: false });

    if (error || !msgs) return;

    // پیدا کردن چت‌های یکتا و آخرین پیام هر چت
    const uniqueChats = {};
    msgs.forEach(msg => {
      if (!uniqueChats[msg.chat_id]) {
        uniqueChats[msg.chat_id] = msg; // چون مرتب شده، اولین پیام آخرین پیام است
      }
    });

    const chatIds = Object.keys(uniqueChats);
    if (chatIds.length === 0) {
      setChatList([]);
      return;
    }

    // پیدا کردن آیدی طرف مقابل از اسم چت
    const otherUids = chatIds.map(id => id.split('_').find(uid => uid !== user.id));

    // گرفتن پروفایل طرف مقابل‌ها
    const { data: profiles } = await supabase.from('profiles').select('id, code, username').in('id', otherUids);

    // ساختن لیست نهایی
    const finalList = chatIds.map(chatId => {
      const otherUid = chatId.split('_').find(uid => uid !== user.id);
      const profile = profiles?.find(p => p.id === otherUid);
      const lastMsg = uniqueChats[chatId];
      
      return {
        chatId,
        otherUid,
        name: profile?.username || `کاربر ${profile?.code || ''}`,
        code: profile?.code,
        lastMessage: lastMsg.image_url ? '📷 عکس' : lastMsg.content,
        lastTime: new Date(lastMsg.created_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
      };
    });

    setChatList(finalList);
  };

  // وقتی کاربر لاگین کرد یا از چت خارج شد، لیست رو آپدیت کن
  useEffect(() => {
    if (user && !chatId) {
      fetchChatList();
    }
  }, [user, chatId]);

  // ذخیره نام
  const saveName = async () => {
    if (!userName.trim()) return;
    await supabase.from('profiles').update({ username: userName }).eq('id', user.id);
    setIsEditingName(false);
    fetchChatList(); // آپدیت لیست برای اینکه اسم جدید تو چت‌ها هم دیده بشه
  };

  // جستجوی کاربر جدید
  const handleSearch = async (e) => {
    e.preventDefault();
    const code = targetCode.trim().toUpperCase();
    if (code === userCode) return alert('این کد خودتان است!');
    
    const { data } = await supabase.from('profiles').select('id, code, username').eq('code', code).maybeSingle();
    
    if (data) {
      openChat(data.id, data.code, data.username);
    } else {
      alert('کاربری با این کد پیدا نشد.');
    }
  };

  // باز کردن یک چت
  const openChat = (otherUid, otherCode, otherName) => {
    const newChatId = [user.id, otherUid].sort().join('_');
    setChatUser({ uid: otherUid, code: otherCode, name: otherName });
    setChatId(newChatId);
    setIsSearching(false); // بستن باکس جستجو
    setTargetCode('');
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
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => prev.filter((msg) => msg.id !== payload.old.id));
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [chatId]);

  // ارسال پیام متنی
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

  // آپلود عکس با فشرده‌سازی
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !chatId) return;

    setUploading(true);
    try {
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
        fileType: 'image/webp',
      };
      const compressedFile = await imageCompression(file, options);
      const fileExt = compressedFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
      const filePath = `${chatId}/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('chat-images').upload(filePath, compressedFile);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(filePath);

      await supabase.from('messages').insert({
        chat_id: chatId,
        sender_id: user.id,
        content: '',
        image_url: publicUrl,
      });

    } catch (error) {
      console.error('خطا در آپلود عکس:', error);
      alert('خطا در آپلود عکس!');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // حذف پیام
  const deleteMessage = async (msgId) => {
    if (window.confirm('آیا از حذف این پیام مطمئن هستید؟')) {
      const { error } = await supabase.from('messages').delete().eq('id', msgId);
      if (error) alert('خطا در حذف پیام!');
      else setMessages((prev) => prev.filter((msg) => msg.id !== msgId));
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(userCode);
    alert('کد اختصاصی کپی شد!');
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div className="loading-screen">در حال اتصال...</div>;
  if (!user) return <div className="loading-screen">در حال ساخت حساب...</div>;

  return (
    <div className="app-container">
      {/* هدر بالا */}
      <header className="header">
        <div className="profile-section">
          {isEditingName ? (
            <div className="edit-name-box">
              <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="اسم شما..." maxLength={15} />
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

      {/* بدنه اصلی */}
      {!chatUser ? (
        <div className="main-list-area">
          {/* هدر لیست چت‌ها */}
          <div className="list-header">
            <h3>چت‌ها</h3>
            <button className="new-chat-btn" onClick={() => setIsSearching(!isSearching)}>
              {isSearching ? 'بستن' : 'چت جدید +'}
            </button>
          </div>

          {/* باکس جستجو (فقط وقتی دکمه چت جدید زده میشه) */}
          {isSearching && (
            <div className="search-area">
              <form className="search-box" onSubmit={handleSearch}>
                <input placeholder="کد اختصاصی دوستتان را وارد کنید..." value={targetCode} onChange={(e) => setTargetCode(e.target.value)} maxLength={6} />
                <button type="submit">شروع</button>
              </form>
            </div>
          )}

          {/* لیست چت‌ها */}
          <div className="chat-list">
            {chatList.length === 0 ? (
              <div className="empty-list">هنوز چتی ندارید. با دکمه بالا یکی شروع کنید!</div>
            ) : (
              chatList.map(chat => (
                <div key={chat.chatId} className="chat-list-item" onClick={() => openChat(chat.otherUid, chat.code, chat.name)}>
                  <div className="avatar">{chat.name.charAt(0)}</div>
                  <div className="chat-info">
                    <div className="chat-name-time">
                      <span className="chat-name">{chat.name}</span>
                      <span className="chat-time">{chat.lastTime}</span>
                    </div>
                    <div className="chat-last-msg">{chat.lastMessage}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* صفحه داخل چت */
        <div className="chat-container">
          <div className="chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="avatar-small">{chatUser.name ? chatUser.name.charAt(0) : '?'}</div>
              <h3>{chatUser.name ? chatUser.name : `چت با ${chatUser.code}`}</h3>
            </div>
            <button className="back-btn" onClick={() => { setChatUser(null); setChatId(null); setMessages([]); }}>
              بستن ✕
            </button>
          </div>

          <div className="messages-area">
            {messages.map(msg => {
              const isMe = msg.sender_id === user.id;
              return (
                <div key={msg.id} className={`message-wrapper ${isMe ? 'outgoing' : 'incoming'}`}>
                  <div className="message-bubble">
                    {msg.image_url ? <img src={msg.image_url} alt="sent" className="chat-image" /> : msg.content}
                  </div>
                  <div className="message-info">
                    <span className="message-time">{formatTime(msg.created_at)}</span>
                    {isMe && <span className="delete-btn" onClick={() => deleteMessage(msg.id)} title="حذف پیام">🗑️</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <form className="input-area" onSubmit={sendMessage}>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
            <button type="button" className="attach-btn" onClick={() => fileInputRef.current.click()} disabled={uploading}>
              {uploading ? '⏳' : '📎'}
            </button>
            <input placeholder="پیام..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} />
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