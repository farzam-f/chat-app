import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import imageCompression from 'browser-image-compression';
import './App.css';

const EMOJIS = ['😊', '😂', '❤️', '👍', '🔥', '😍', '🙏', '👏', '😢', '😡', '🎉', '👀', '💯', '🤔', '😎', '🤝'];

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userCode, setUserCode] = useState('');
  const [userName, setUserName] = useState('');
  const [userAvatar, setUserAvatar] = useState('');
  
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);

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
  const [replyingTo, setReplyingTo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState(null);
  
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const chatChannelRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);

  // تغییر تم
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

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

  // ۳. تنظیم پروفایل
  useEffect(() => {
    const setupUserProfile = async () => {
      if (user) {
        let localCode = localStorage.getItem('myChatCode');
        const { data, error } = await supabase.from('profiles').select('code, username, avatar_url').eq('id', user.id).maybeSingle();
        if (error) return console.error(error);

        if (!data) {
          if (!localCode) { localCode = await generateUniqueCode(); localStorage.setItem('myChatCode', localCode); }
          const { error: insertError } = await supabase.from('profiles').insert({ id: user.id, code: localCode });
          if (insertError) {
            const newCode = await generateUniqueCode();
            localStorage.setItem('myChatCode', newCode);
            await supabase.from('profiles').insert({ id: user.id, code: newCode });
            setUserCode(newCode);
          } else { setUserCode(localCode); }
        } else {
          setUserCode(data.code); setUserName(data.username || ''); setUserAvatar(data.avatar_url || '');
          localStorage.setItem('myChatCode', data.code);
        }
      }
    };
    setupUserProfile();
  }, [user]);

  // ۴. دریافت لیست چت‌ها
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

  useEffect(() => { if (user && !chatId) fetchChatList(); }, [user, chatId]);

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

  // باز کردن چت و چک کردن اولیه مسدودیت
  const openChat = async (otherUid, otherCode, otherName, otherAvatar) => {
    const newChatId = [user.id, otherUid].sort().join('_');
    setChatUser({ uid: otherUid, code: otherCode, name: otherName, avatarUrl: otherAvatar });
    setChatId(newChatId);
    setIsSearching(false); setTargetCode(''); setIsOtherTyping(false); setReplyingTo(null); setEditingMessage(null);

    await checkBlockStatus(otherUid);
  };

  // تابع چک کردن وضعیت بلاک
  const checkBlockStatus = async (otherUid) => {
    const { data: myProfile } = await supabase.from('profiles').select('blocked_ids').eq('id', user.id).single();
    const { data: otherProfile } = await supabase.from('profiles').select('blocked_ids').eq('id', otherUid).single();
    setIsBlockedByMe(myProfile?.blocked_ids?.includes(otherUid) || false);
    setHasBlockedMe(otherProfile?.blocked_ids?.includes(user.id) || false);
  };

  // شنونده زنده برای تغییرات بلاک
  useEffect(() => {
    if (!chatUser) return;
    const profileChannel = supabase.channel(`profile-blocks-${chatUser.uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        if (payload.new.id === user.id) {
          setIsBlockedByMe(payload.new.blocked_ids?.includes(chatUser.uid) || false);
        }
        if (payload.new.id === chatUser.uid) {
          setHasBlockedMe(payload.new.blocked_ids?.includes(user.id) || false);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(profileChannel);
  }, [chatUser, user]);

  // مسدود / رفع مسدودیت
  const toggleBlock = async () => {
    const { data: myProfile } = await supabase.from('profiles').select('blocked_ids').eq('id', user.id).single();
    let blocked = myProfile?.blocked_ids || [];

    if (isBlockedByMe) {
      blocked = blocked.filter(id => id !== chatUser.uid);
    } else {
      blocked.push(chatUser.uid);
    }

    await supabase.from('profiles').update({ blocked_ids: blocked }).eq('id', user.id);
    setIsBlockedByMe(!isBlockedByMe);
  };

  // ۵. دریافت پیام‌ها
  useEffect(() => {
    if (!chatId) return;

    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
      if (data) {
        const parsedData = data.map(m => ({ ...m, reactions: m.reactions || {} }));
        setMessages(parsedData);
      }
    };
    fetchMessages();

    const channel = supabase
      .channel(`chat-room-${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload) => {
        setMessages((prev) => [...prev, { ...payload.new, reactions: payload.new.reactions || {} }]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => prev.filter((msg) => msg.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload) => {
        setMessages((prev) => prev.map(msg => msg.id === payload.new.id ? { ...payload.new, reactions: payload.new.reactions || {} } : msg));
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.user_id !== user?.id) { 
          setIsOtherTyping(true);
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), 2500);
        }
      })
      .subscribe();

    chatChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); setIsOtherTyping(false); };
  }, [chatId, user]);

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    if (e.target.value.length > 0 && chatChannelRef.current) {
      chatChannelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: user.id } });
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId) return;

    // چک نهایی قبل از ارسال
    const { data: otherProfile } = await supabase.from('profiles').select('blocked_ids').eq('id', chatUser.uid).single();
    if (otherProfile?.blocked_ids?.includes(user.id) || isBlockedByMe) {
      alert('امکان ارسال پیام وجود ندارد (مسدودیت)');
      return;
    }

    const msgText = newMessage;
    setNewMessage('');
    
    if (editingMessage) {
      await supabase.from('messages').update({ content: msgText, is_edited: true }).eq('id', editingMessage.id);
      setEditingMessage(null);
    } else {
      await supabase.from('messages').insert({ 
        chat_id: chatId, sender_id: user.id, content: msgText,
        reply_to_id: replyingTo ? replyingTo.id : null,
        reactions: {}
      });
      setReplyingTo(null);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !chatId || isBlockedByMe || hasBlockedMe) return;

    // چک نهایی قبل از ارسال
    const { data: otherProfile } = await supabase.from('profiles').select('blocked_ids').eq('id', chatUser.uid).single();
    if (otherProfile?.blocked_ids?.includes(user.id) || isBlockedByMe) {
      alert('امکان ارسال پیام وجود ندارد (مسدودیت)');
      return;
    }

    setUploading(true);
    try {
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1280, useWebWorker: true, fileType: 'image/webp' };
      const compressedFile = await imageCompression(file, options);
      const filePath = `${chatId}/${Date.now()}-${Math.random()}.${compressedFile.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('chat-images').upload(filePath, compressedFile);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(filePath);
      
      await supabase.from('messages').insert({ 
        chat_id: chatId, sender_id: user.id, content: '', image_url: publicUrl,
        reply_to_id: replyingTo ? replyingTo.id : null,
        reactions: {}
      });
      setReplyingTo(null);
    } catch (error) { alert('خطا در آپلود عکس!'); } finally { setUploading(false); }
  };

  const handleReaction = async (msgId, emoji) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    let newReactions = JSON.parse(JSON.stringify(msg.reactions || {}));
    
    if (newReactions[emoji] && newReactions[emoji].includes(user.id)) {
      newReactions[emoji] = newReactions[emoji].filter(id => id !== user.id);
      if (newReactions[emoji].length === 0) delete newReactions[emoji];
    } else {
      if (!newReactions[emoji]) newReactions[emoji] = [];
      newReactions[emoji].push(user.id);
    }
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: newReactions } : m));
    await supabase.from('messages').update({ reactions: newReactions }).eq('id', msgId);
    setReactionPickerMsgId(null);
  };

  const deleteMessage = async (msgId) => {
    if (window.confirm('آیا از حذف این پیام مطمئن هستید؟')) {
      const { error } = await supabase.from('messages').delete().eq('id', msgId);
      if (!error) setMessages((prev) => prev.filter((msg) => msg.id !== msgId));
    }
  };

  const addEmoji = (emoji) => { setNewMessage(prev => prev + emoji); };
  const copyCode = () => { navigator.clipboard.writeText(userCode); alert('کد اختصاصی کپی شد!'); };
  const formatTime = (timestamp) => { if (!timestamp) return ''; return new Date(timestamp).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }); };

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
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="theme-toggle-btn" onClick={toggleTheme} title="تغییر تم">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div className="user-code-badge" onClick={copyCode}>{userCode || '...'}</div>
        </div>
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
                  {isOtherTyping ? <span className="typing-text">در حال تایپ...</span> : isOtherOnline ? <span className="online-text">آنلاین</span> : <span className="offline-text">آفلاین</span>}
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button className="block-btn" onClick={toggleBlock} title={isBlockedByMe ? "رفع مسدودیت" : "مسدود کردن"}>
                {isBlockedByMe ? '✅' : '🚫'}
              </button>
              <button className="back-btn" onClick={() => { setChatUser(null); setChatId(null); setMessages([]); setReplyingTo(null); setEditingMessage(null); }}>
                بستن ✕
              </button>
            </div>
          </div>

          {isBlockedByMe && (
            <div className="system-message blocked-msg">شما این کاربر را مسدود کرده‌اید. برای ارسال پیام، ابتدا رفع مسدودیت کنید.</div>
          )}
          {hasBlockedMe && (
            <div className="system-message blocked-msg">شما توسط این کاربر مسدود شده‌اید و نمی‌توانید پیام ارسال کنید.</div>
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
                        <div className="quoted-name">{repliedMsg.sender_id === user.id ? 'شما' : chatUser.name}</div>
                        <div className="quoted-text">{repliedMsg.image_url ? '📷 عکس' : repliedMsg.content}</div>
                      </div>
                    )}
                    {msg.image_url ? <img src={msg.image_url} alt="sent" className="chat-image" /> : msg.content}
                    <div className="message-meta">
                       {msg.is_edited && <span className="edited-tag">(ویرایش شده)</span>}
                    </div>
                  </div>
                  
                  {hasReactions && (
                    <div className="reactions-container">
                      {Object.entries(msg.reactions).map(([emoji, users]) => (
                        <span key={emoji} className="reaction-badge" onClick={() => handleReaction(msg.id, emoji)}>
                          {emoji} {users.length > 1 ? users.length : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="message-info">
                    <span className="message-time">{formatTime(msg.created_at)}</span>
                    <div className="message-actions">
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <span className="action-btn" onClick={(e) => { e.stopPropagation(); setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id); }}>❤️</span>
                        {reactionPickerMsgId === msg.id && (
                          <div className={`reaction-picker ${isMe ? 'picker-left' : 'picker-right'}`}>
                            {EMOJIS.slice(0, 6).map(e => (
                              <span key={e} onClick={() => handleReaction(msg.id, e)}>{e}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="action-btn" onClick={() => setReplyingTo(msg)} title="پاسخ">↩️</span>
                      {isMe && <span className="action-btn" onClick={() => { setEditingMessage(msg); setNewMessage(msg.content); }} title="ویرایش">✏️</span>}
                      {isMe && <span className="action-btn" onClick={() => deleteMessage(msg.id)} title="حذف">🗑️</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {(replyingTo || editingMessage) && (
            <div className="reply-banner" style={{ borderRightColor: editingMessage ? '#ffc107' : 'var(--accent-color)' }}>
              <div className="reply-banner-info">
                <span className="reply-banner-name" style={{ color: editingMessage ? '#ffc107' : 'var(--accent-color)' }}>
                  {editingMessage ? 'در حال ویرایش پیام' : (replyingTo.sender_id === user.id ? 'پاسخ به خودتان' : `پاسخ به ${chatUser.name}`)}
                </span>
                <span className="reply-banner-text">{editingMessage ? editingMessage.content : (replyingTo.image_url ? '📷 عکس' : replyingTo.content)}</span>
              </div>
              <button className="cancel-reply-btn" onClick={() => { setReplyingTo(null); setEditingMessage(null); setNewMessage(''); }}>✕</button>
            </div>
          )}

          <form className="input-area" onSubmit={handleSendMessage}>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
            <button type="button" className="attach-btn" onClick={() => fileInputRef.current.click()} disabled={uploading || isBlockedByMe || hasBlockedMe}>
              {uploading ? '⏳' : '📎'}
            </button>
            
            <div style={{ position: 'relative' }}>
              <button type="button" className="emoji-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)} disabled={isBlockedByMe || hasBlockedMe}>😊</button>
              {showEmojiPicker && (
                <div className="emoji-picker">
                  {EMOJIS.map(e => <span key={e} onClick={() => addEmoji(e)}>{e}</span>)}
                </div>
              )}
            </div>

            <input 
              type="text" 
              placeholder={isBlockedByMe || hasBlockedMe ? "امکان ارسال پیام وجود ندارد..." : "پیام..."} 
              value={newMessage} 
              onChange={handleTyping}
              disabled={isBlockedByMe || hasBlockedMe}
            />
            
            <button type="submit" className="send-btn" disabled={isBlockedByMe || hasBlockedMe}>
              <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;