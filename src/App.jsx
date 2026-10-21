import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import imageCompression from 'browser-image-compression';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userCode, setUserCode] = useState('');
  const [userName, setUserName] = useState('');
  const [userAvatar, setUserAvatar] = useState('');
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [chatList, setChatList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [targetCode, setTargetCode] = useState('');
  const [chatUser, setChatUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatId, setChatId] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const chatChannelRef = useRef(null);
  const typingTimeoutRef = useRef(null);

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

  // ۲. سیستم آنلاین بودن (Presence)
  useEffect(() => {
    if (!user) return;

    const presenceChannel = supabase.channel('online-users', {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setOnlineUsers(Object.keys(state));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [user]);

  const generateUniqueCode = async () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const { data } = await supabase.from('profiles').select('code').eq('code', code).maybeSingle();
    return data ? generateUniqueCode() : code;
  };

  useEffect(() => {
    const setupUserProfile = async () => {
      if (user) {
        let localCode = localStorage.getItem('myChatCode');
        const { data, error } = await supabase.from('profiles').select('code, username, avatar_url').eq('id', user.id).maybeSingle();
        
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
          setUserAvatar(data.avatar_url || '');
          localStorage.setItem('myChatCode', data.code);
        }
      }
    };
    setupUserProfile();
  }, [user]);

  const fetchChatList = async () => {
    if (!user) return;
    const { data: msgs, error } = await supabase.from('messages').select('chat_id, content, image_url, created_at').like('chat_id', `%${user.id}%`).order('created_at', { ascending: false });
    if (error || !msgs) return;

    const uniqueChats = {};
    msgs.forEach(msg => { if (!uniqueChats[msg.chat_id]) uniqueChats[msg.chat_id] = msg; });
    const chatIds = Object.keys(uniqueChats);
    if (chatIds.length === 0) return setChatList([]);

    const otherUids = chatIds.map(id => id.split('_').find(uid => uid !== user.id));
    const { data: profiles } = await supabase.from('profiles').select('id, code, username, avatar_url').in('id', otherUids);

    const finalList = chatIds.map(chatId => {
      const otherUid = chatId.split('_').find(uid => uid !== user.id);
      const profile = profiles?.find(p => p.id === otherUid);
      const lastMsg = uniqueChats[chatId];
      return {
        chatId, otherUid, name: profile?.username || `کاربر ${profile?.code || ''}`,
        code: profile?.code, avatarUrl: profile?.avatar_url,
        lastMessage: lastMsg.image_url ? '📷 عکس' : lastMsg.content,
        lastTime: new Date(lastMsg.created_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
      };
    });
    setChatList(finalList);
  };

  useEffect(() => {
    if (user && !chatId) fetchChatList();
  }, [user, chatId]);

  const saveName = async () => {
    if (!userName.trim()) return;
    await supabase.from('profiles').update({ username: userName }).eq('id', user.id);
    setIsEditingName(false);
    fetchChatList();
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const options = { maxSizeMB: 0.1, maxWidthOrHeight: 256, useWebWorker: true, fileType: 'image/webp' };
      const compressedFile = await imageCompression(file, options);
      const filePath = `avatars/${user.id}.webp`;
      const { error: uploadError } = await supabase.storage.from('chat-images').upload(filePath, compressedFile, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(filePath);
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      setUserAvatar(publicUrl);
      fetchChatList();
    } catch (error) { alert('خطا در آپلود عکس پروفایل!'); } finally { setUploading(false); }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    const code = targetCode.trim().toUpperCase();
    if (code === userCode) return alert('این کد خودتان است!');
    const { data } = await supabase.from('profiles').select('id, code, username, avatar_url').eq('code', code).maybeSingle();
    if (data) openChat(data.id, data.code, data.username, data.avatar_url);
    else alert('کاربری با این کد پیدا نشد.');
  };

  const openChat = (otherUid, otherCode, otherName, otherAvatar) => {
    const newChatId = [user.id, otherUid].sort().join('_');
    setChatUser({ uid: otherUid, code: otherCode, name: otherName, avatarUrl: otherAvatar });
    setChatId(newChatId);
    setIsSearching(false);
    setTargetCode('');
    setIsOtherTyping(false);
  };

  // دریافت پیام‌ها و وضعیت تایپ (Real-time)
  useEffect(() => {
    if (!chatId) return;

    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();

    const channel = supabase
      .channel(`chat-room-${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => prev.filter((msg) => msg.id !== payload.old.id));
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        // ✅ استفاده از user?.id برای جلوگیری از خطا وقتی user هنوز لود نشده
        if (payload.user_id !== user?.id) { 
          setIsOtherTyping(true);
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), 2500);
        }
      })
      .subscribe();

    chatChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      setIsOtherTyping(false);
    };
  // ✅ تغییر dependency array از user.id به user
  }, [chatId, user]); 

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    if (e.target.value.length > 0 && chatChannelRef.current) {
      chatChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: user.id }
      });
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId) return;
    const msgText = newMessage;
    setNewMessage('');
    await supabase.from('messages').insert({ chat_id: chatId, sender_id: user.id, content: msgText });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !chatId) return;
    setUploading(true);
    try {
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1280, useWebWorker: true, fileType: 'image/webp' };
      const compressedFile = await imageCompression(file, options);
      const fileExt = compressedFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
      const filePath = `${chatId}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('chat-images').upload(filePath, compressedFile);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(filePath);
      await supabase.from('messages').insert({ chat_id: chatId, sender_id: user.id, content: '', image_url: publicUrl });
    } catch (error) { alert('خطا در آپلود عکس!'); } finally { setUploading(false); }
  };

  const deleteMessage = async (msgId) => {
    if (window.confirm('آیا از حذف این پیام مطمئن هستید؟')) {
      const { error } = await supabase.from('messages').delete().eq('id', msgId);
      if (!error) setMessages((prev) => prev.filter((msg) => msg.id !== msgId));
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(userCode);
    alert('کد اختصاصی کپی شد!');
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div className="loading-screen">در حال اتصال...</div>;
  if (!user) return <div className="loading-screen">در حال ساخت حساب...</div>;

  const isOtherOnline = chatUser ? onlineUsers.includes(chatUser.uid) : false;

  return (
    <div className="app-container">
      <header className="header">
        <div className="profile-section">
          <div className="my-avatar" onClick={() => avatarInputRef.current.click()}>
            {uploading ? '⏳' : (userAvatar ? <img src={userAvatar} alt="avatar" /> : (userName ? userName.charAt(0) : '👤'))}
          </div>
          <input type="file" accept="image/*" ref={avatarInputRef} onChange={handleAvatarUpload} style={{ display: 'none' }} />

          {isEditingName ? (
            <div className="edit-name-box">
              <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="اسم شما..." maxLength={15} />
              <button onClick={saveName}>ذخیره</button>
            </div>
          ) : (
            <h2 onClick={() => setIsEditingName(true)} style={{ cursor: 'pointer', marginRight: '10px' }}>
              {userName ? userName : 'پیام‌رسان ✎'}
            </h2>
          )}
        </div>
        <div className="user-code-badge" onClick={copyCode}>{userCode || '...'}</div>
      </header>

      {!chatUser ? (
        <div className="main-list-area">
          <div className="list-header">
            <h3>چت‌ها</h3>
            <button className="new-chat-btn" onClick={() => setIsSearching(!isSearching)}>
              {isSearching ? 'بستن' : 'چت جدید +'}
            </button>
          </div>

          {isSearching && (
            <div className="search-area">
              <form className="search-box" onSubmit={handleSearch}>
                <input placeholder="کد اختصاصی..." value={targetCode} onChange={(e) => setTargetCode(e.target.value)} maxLength={6} />
                <button type="submit">شروع</button>
              </form>
            </div>
          )}

          <div className="chat-list">
            {chatList.length === 0 ? (
              <div className="empty-list">هنوز چتی ندارید.</div>
            ) : (
              chatList.map(chat => {
                const isOnlineInList = onlineUsers.includes(chat.otherUid);
                return (
                  <div key={chat.chatId} className="chat-list-item" onClick={() => openChat(chat.otherUid, chat.code, chat.name, chat.avatarUrl)}>
                    <div className="avatar-container">
                      <div className="avatar">
                        {chat.avatarUrl ? <img src={chat.avatarUrl} alt="avatar" /> : chat.name.charAt(0)}
                      </div>
                      {isOnlineInList && <div className="online-dot-list"></div>}
                    </div>
                    <div className="chat-info">
                      <div className="chat-name-time">
                        <span className="chat-name">{chat.name}</span>
                        <span className="chat-time">{chat.lastTime}</span>
                      </div>
                      <div className="chat-last-msg">{chat.lastMessage}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="chat-container">
          <div className="chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="avatar-small">
                {chatUser.avatarUrl ? <img src={chatUser.avatarUrl} alt="avatar" /> : (chatUser.name ? chatUser.name.charAt(0) : '?')}
              </div>
              <div>
                <h3 style={{ margin: 0 }}>{chatUser.name ? chatUser.name : `چت با ${chatUser.code}`}</h3>
                <div className="status-text">
                  {isOtherTyping ? (
                    <span className="typing-text">در حال تایپ...</span>
                  ) : isOtherOnline ? (
                    <span className="online-text">آنلاین</span>
                  ) : (
                    <span className="offline-text">آفلاین</span>
                  )}
                </div>
              </div>
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
                    {isMe && <span className="delete-btn" onClick={() => deleteMessage(msg.id)}>🗑️</span>}
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
            <input 
              type="text"
              placeholder="پیام..." 
              value={newMessage} 
              onChange={handleTyping}
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