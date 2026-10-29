import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import imageCompression from 'browser-image-compression';
import logoImg from './logo.png';
import './App.css';

const EMOJIS = ['😊', '😂', '❤️', '👍', '🔥', '😍', '🙏', '👏', '😢', '😡', '🎉', '👀', '💯', '🤔', '😎', '🤝'];

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userCode, setUserCode] = useState('');
  const [userName, setUserName] = useState('');
  const [userAvatar, setUserAvatar] = useState('');
  
  // استیت‌های جدید برای ثبت‌نام
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [chatList, setChatList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState('user'); // user or group
  const [targetCode, setTargetCode] = useState('');
  const [groupName, setGroupName] = useState('');
  
  const [chatUser, setChatUser] = useState(null); // for private chat
  const [groupChat, setGroupChat] = useState(null); // for group chat
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatId, setChatId] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState(null);
  
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const chatChannelRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

  // ۱. لاگین و چک کردن ثبت‌نام
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

  // ۲. سیستم آنلاین بودن
  useEffect(() => {
    if (!user) return;
    const presenceChannel = supabase.channel('online-users', { config: { presence: { key: user.id } } });
    presenceChannel.on('presence', { event: 'sync' }, () => {
      setOnlineUsers(Object.keys(presenceChannel.presenceState()));
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await presenceChannel.track({ online_at: new Date().toISOString() });
    });
    return () => { supabase.removeChannel(presenceChannel); };
  }, [user]);

  const generateUniqueCode = async () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); }
    const { data } = await supabase.from('profiles').select('code').eq('code', code).maybeSingle();
    return data ? generateUniqueCode() : code;
  };

  // ۳. تنظیم پروفایل (با چک کردن یوزرنیم/پسورد)
  useEffect(() => {
    const setupUserProfile = async () => {
      if (user) {
        let localCode = localStorage.getItem('myChatCode');
        const { data, error } = await supabase.from('profiles').select('code, username, avatar_url, username_login').eq('id', user.id).maybeSingle();
        if (error) return console.error(error);

        if (!data) {
          // اگر کاربر جدید بود
          if (!localCode) { localCode = await generateUniqueCode(); localStorage.setItem('myChatCode', localCode); }
          const { error: insertError } = await supabase.from('profiles').insert({ id: user.id, code: localCode });
          if (insertError) {
            const newCode = await generateUniqueCode();
            localStorage.setItem('myChatCode', newCode);
            await supabase.from('profiles').insert({ id: user.id, code: newCode });
            setUserCode(newCode);
          } else { setUserCode(localCode); }
          setNeedsRegistration(true); // نیاز به ثبت‌نام دارد
        } else {
          setUserCode(data.code); setUserName(data.username || ''); setUserAvatar(data.avatar_url || '');
          localStorage.setItem('myChatCode', data.code);
          if (!data.username_login) setNeedsRegistration(true); // اگر یوزرنیم نداشت، باید ثبت‌نام کنه
        }
      }
    };
    setupUserProfile();
  }, [user]);

  // ثبت‌نام کاربر
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regUsername.trim() || !regPassword.trim()) return alert('نام کاربری و رمز عبور را وارد کنید');
    
    // بررسی تکراری نبودن نام کاربری
    const { data: existing } = await supabase.from('profiles').select('id').eq('username_login', regUsername).maybeSingle();
    if (existing) return alert('این نام کاربری قبلاً گرفته شده است!');

    await supabase.from('profiles').update({ 
      username_login: regUsername, 
      password_login: regPassword 
    }).eq('id', user.id);
    
    setNeedsRegistration(false);
    alert('ثبت‌نام با موفقیت انجام شد!');
  };

  // ... توابع دریافت لیست چت‌ها، جستجو، و غیره
  const fetchChatList = async () => {
    if (!user) return;
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('chat_id, content, image_url, audio_url, file_url, created_at, sender_id, is_read, deleted_for, group_id')
      .or(`chat_id.like.%${user.id}%,group_id.not.is.null`)
      .order('created_at', { ascending: false });

    if (error || !msgs) return;

    const visibleMsgs = msgs.filter(msg => !(msg.deleted_for || []).includes(user.id));
    const uniqueChats = {};
    const unreadCounts = {};

    visibleMsgs.forEach(msg => {
      if (!msg.group_id) {
        if (!uniqueChats[msg.chat_id]) uniqueChats[msg.chat_id] = msg;
        if (msg.sender_id !== user.id && !msg.is_read) unreadCounts[msg.chat_id] = (unreadCounts[msg.chat_id] || 0) + 1;
      }
    });

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
        lastMessage: lastMsg.file_url ? '📎 فایل' : (lastMsg.image_url ? '📷 عکس' : (lastMsg.audio_url ? '🎙️ ویس' : lastMsg.content)),
        lastTime: new Date(lastMsg.created_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
        unreadCount: unreadCounts[chatId] || 0
      };
    });
    setChatList(finalList);
  };

  useEffect(() => { if (user && !chatId) fetchChatList(); }, [user, chatId, groupChat]);

  // ... بقیه توابع (جستجو، باز کردن چت، دریافت پیام‌ها و...)
  const handleSearch = async (e) => {
    e.preventDefault();
    const code = targetCode.trim().toUpperCase();
    if (code === userCode) return alert('این کد خودتان است!');
    const { data } = await supabase.from('profiles').select('id, code, username, avatar_url').eq('code', code).maybeSingle();
    if (data) openChat(data.id, data.code, data.username, data.avatar_url);
    else alert('کاربری با این کد پیدا نشد.');
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    const { data, error } = await supabase.from('groups').insert({ name: groupName, creator_id: user.id }).select().single();
    if (!error && data) {
      await supabase.from('group_members').insert({ group_id: data.id, user_id: user.id });
      setGroupChat(data);
      setChatId(data.id);
      setGroupName('');
    }
  };

  const openChat = async (otherUid, otherCode, otherName, otherAvatar) => {
    const newChatId = [user.id, otherUid].sort().join('_');
    setChatUser({ uid: otherUid, code: otherCode, name: otherName, avatarUrl: otherAvatar });
    setChatId(newChatId);
    setIsSearching(false); setTargetCode(''); setIsOtherTyping(false); setReplyingTo(null); setEditingMessage(null);

    await supabase.from('messages').update({ is_read: true }).eq('chat_id', newChatId).neq('sender_id', user.id).eq('is_read', false);
    setChatList(prev => prev.map(c => c.chatId === newChatId ? { ...c, unreadCount: 0 } : c));
  };

  // ... ادامه توابع دریافت و ارسال پیام‌ها
  useEffect(() => {
    if (!chatId) return;
    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').eq(chatId, groupChat ? 'group_id' : 'chat_id', chatId).order('created_at', { ascending: true });
      if (data) {
        const visibleMsgs = data.filter(m => !(m.deleted_for || []).includes(user.id));
        const parsedData = visibleMsgs.map(m => ({ ...m, reactions: m.reactions || {} }));
        setMessages(parsedData);
      }
    };
    fetchMessages();

    const channel = supabase
      .channel(`chat-room-${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if ((payload.new.group_id === chatId) || (payload.new.chat_id === chatId)) {
          setMessages((prev) => [...prev, { ...payload.new, reactions: payload.new.reactions || {} }]);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => prev.filter((msg) => msg.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        if ((payload.new.group_id === chatId) || (payload.new.chat_id === chatId)) {
          setMessages((prev) => {
            const updated = prev.map(msg => msg.id === payload.new.id ? { ...payload.new, reactions: payload.new.reactions || {} } : msg);
            return updated.filter(m => !(m.deleted_for || []).includes(user.id));
          });
        }
      })
      .subscribe();

    chatChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [chatId, groupChat, user]);

  // ... توابع ارسال عکس، فایل، ویس
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !chatId) return;
    setUploading(true);
    try {
      const filePath = `${chatId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('chat-images').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(filePath);
      
      await supabase.from('messages').insert({ 
        chat_id: groupChat ? null : chatId, 
        group_id: groupChat ? chatId : null,
        sender_id: user.id, content: '', file_url: publicUrl, file_name: file.name, file_type: file.type,
        reply_to_id: replyingTo ? replyingTo.id : null, reactions: {}
      });
      setReplyingTo(null);
    } catch (error) { alert('خطا در آپلود فایل!'); } finally { setUploading(false); }
  };

  // ... بقیه کدهای ارسال متن، ویس، ری‌اکشن و ...

  if (loading) return <div className="loading-screen">در حال اتصال...</div>;
  if (!user) return <div className="loading-screen">در حال ساخت حساب...</div>;

  // صفحه ثبت‌نام (اگر کاربر یوزرنیم/پسورد نداشت)
  if (needsRegistration) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <img src={logoImg} alt="Logo" className="auth-logo" />
          <h2>ثبت‌نام در F.L.W</h2>
          <p>برای ادامه، یک نام کاربری و رمز عبور انتخاب کنید.</p>
          <form onSubmit={handleRegister}>
            <input type="text" placeholder="نام کاربری..." value={regUsername} onChange={(e) => setRegUsername(e.target.value)} />
            <input type="password" placeholder="رمز عبور..." value={regPassword} onChange={(e) => setRegPassword(e.target.value)} />
            <button type="submit">ثبت‌نام</button>
          </form>
        </div>
      </div>
    );
  }

  // ... ادامه رابط کاربری اصلی
  const isOtherOnline = chatUser ? onlineUsers.includes(chatUser.uid) : false;

  return (
    <div className="app-container">
      <header className="header">
        <div className="profile-section">
          <div className="my-avatar" onClick={() => avatarInputRef.current.click()}>
            {uploading ? '⏳' : (userAvatar ? <img src={userAvatar} alt="avatar" /> : (userName ? userName.charAt(0) : '👤'))}
          </div>
          <input type="file" accept="image/*" ref={avatarInputRef} onChange={(e) => { /* logic */ }} style={{ display: 'none' }} />
          {isEditingName ? (
            <div className="edit-name-box">
              <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="اسم شما..." maxLength={15} />
              <button onClick={() => { /* logic */ }}>ذخیره</button>
            </div>
          ) : (
            <h2 onClick={() => setIsEditingName(true)} style={{ cursor: 'pointer', marginRight: '10px' }}>{userName || 'F.L.W ✎'}</h2>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="theme-toggle-btn" onClick={toggleTheme} title="تغییر تم">{theme === 'dark' ? '☀️' : '🌙'}</button>
          <div className="user-code-badge">{userCode}</div>
        </div>
      </header>

      {!chatUser && !groupChat ? (
        <div className="main-list-area">
          <div className="list-header">
            <div className="brand-logo-img"><img src={logoImg} alt="F.L.W Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
            <button className="new-chat-btn" onClick={() => setIsSearching(!isSearching)}>{isSearching ? 'بستن' : 'چت جدید +'}</button>
          </div>
          
          {isSearching && (
            <div className="search-area">
              <div className="tabs">
                <button className={searchMode === 'user' ? 'active' : ''} onClick={() => setSearchMode('user')}>چت خصوصی</button>
                <button className={searchMode === 'group' ? 'active' : ''} onClick={() => setSearchMode('group')}>ساخت گروه</button>
              </div>
              
              {searchMode === 'user' ? (
                <form className="search-box" onSubmit={handleSearch}>
                  <input placeholder="کد اختصاصی..." value={targetCode} onChange={(e) => setTargetCode(e.target.value)} maxLength={6} />
                  <button type="submit">شروع</button>
                </form>
              ) : (
                <form className="search-box" onSubmit={handleCreateGroup}>
                  <input placeholder="نام گروه..." value={groupName} onChange={(e) => setGroupName(e.target.value)} />
                  <button type="submit">ساخت</button>
                </form>
              )}
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
                      <div className="avatar">{chat.avatarUrl ? <img src={chat.avatarUrl} alt="avatar" /> : chat.name.charAt(0)}</div>
                      {isOnlineInList && <div className="online-dot-list"></div>}
                    </div>
                    <div className="chat-info">
                      <div className="chat-name-time"><span className="chat-name">{chat.name}</span><span className="chat-time">{chat.lastTime}</span></div>
                      <div className="chat-last-msg-row"><div className="chat-last-msg">{chat.lastMessage}</div>{chat.unreadCount > 0 && <div className="unread-badge">{chat.unreadCount}</div>}</div>
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
              <div className="avatar-small">{chatUser?.avatarUrl ? <img src={chatUser.avatarUrl} /> : (groupChat ? groupChat.name.charAt(0) : '?')}</div>
              <div>
                <h3 style={{ margin: 0 }}>{groupChat ? groupChat.name : (chatUser?.name || `چت با ${chatUser?.code}`)}</h3>
                {!groupChat && (
                  <div className="status-text">{isOtherTyping ? <span className="typing-text">در حال تایپ...</span> : isOtherOnline ? <span className="online-text">آنلاین</span> : <span className="offline-text">آفلاین</span>}</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
               <button className="block-btn" onClick={() => setShowClearModal(true)} title="حذف چت">🗑️</button>
               <button className="back-btn" onClick={() => { setChatUser(null); setGroupChat(null); setChatId(null); setMessages([]); }}>بستن ✕</button>
            </div>
          </div>

          {/* مودال حذف (همون قبلی) */}
          {showClearModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h3>حذف تاریخچه</h3>
                <div className="modal-actions">
                  <button className="btn-me" onClick={() => { /* logic me */ setShowClearModal(false); }}>حذف فقط برای من</button>
                  <button className="btn-both" onClick={() => { /* logic both */ setShowClearModal(false); }}>حذف برای هر دو</button>
                  <button className="btn-cancel" onClick={() => setShowClearModal(false)}>انصراف</button>
                </div>
              </div>
            </div>
          )}

          <div className="messages-area">
            {messages.map(msg => {
              const isMe = msg.sender_id === user.id;
              const repliedMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;
              const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0;

              return (
                <div key={msg.id} className={`message-wrapper ${isMe ? 'outgoing' : 'incoming'}`}>
                  <div className="message-bubble">
                    {repliedMsg && (
                      <div className="quoted-message">
                        <div className="quoted-name">{repliedMsg.sender_id === user.id ? 'شما' : 'طرف مقابل'}</div>
                        <div className="quoted-text">{repliedMsg.file_url ? '📎 فایل' : repliedMsg.image_url ? '📷 عکس' : (repliedMsg.audio_url ? '🎙️ ویس' : repliedMsg.content)}</div>
                      </div>
                    )}
                    
                    {/* نمایش محتوا */}
                    {msg.file_url ? (
                      <div className="file-message">
                        <span>📎 {msg.file_name || 'فایل'}</span>
                        <a href={msg.file_url} download target="_blank" className="download-btn">⬇️ دانلود</a>
                      </div>
                    ) : msg.audio_url ? (
                      <div className="audio-message"><audio controls src={msg.audio_url} className="voice-player" /><a href={msg.audio_url} download className="download-icon">⬇️</a></div>
                    ) : msg.image_url ? (
                      <div className="image-message"><img src={msg.image_url} alt="sent" className="chat-image" /><a href={msg.image_url} download className="download-icon">⬇️</a></div>
                    ) : ( msg.content )}
                    
                    <div className="message-meta">{msg.is_edited && <span className="edited-tag">(ویرایش شده)</span>}</div>
                  </div>

                  {hasReactions && <div className="reactions-container">...</div>}

                  <div className="message-info">
                    <span className="message-time">{new Date(msg.created_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <div className="message-actions">
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <span className="action-btn" onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id)}>❤️</span>
                      </div>
                      <span className="action-btn" onClick={() => setReplyingTo(msg)} title="پاسخ">↩️</span>
                      {isMe && <span className="action-btn" onClick={() => deleteMessage(msg.id)} title="حذف">🗑️</span>}
                      {/* قابلیت حذف پیام طرف مقابل از هر دو */}
                      {!isMe && <span className="action-btn" onClick={() => deleteMessageForBoth(msg.id)} title="حذف از هر دو">❌</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-area">
            <form onSubmit={handleSendMessage} className="input-form">
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
              <input type="file" ref={docInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
              <button type="button" className="attach-btn" onClick={() => fileInputRef.current.click()} disabled={uploading}>📷</button>
              <button type="button" className="attach-btn" onClick={() => docInputRef.current.click()} disabled={uploading}>📎</button>
              
              <input type="text" placeholder="پیام..." value={newMessage} onChange={handleTyping} />
              
              {newMessage.trim() ? (
                <button type="submit" className="send-btn"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg></button>
              ) : (
                <button type="button" className="send-btn mic-btn" onClick={startRecording}>🎙️</button>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;