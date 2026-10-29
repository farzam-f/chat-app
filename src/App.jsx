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
  
  const [isLogin, setIsLogin] = useState(false);
  const [authName, setAuthName] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [chatList, setChatList] = useState([]);
  const [groupList, setGroupList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTab, setSearchTab] = useState('user');
  const [targetCode, setTargetCode] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  
  const [chatUser, setChatUser] = useState(null);
  const [groupChat, setGroupChat] = useState(null);
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

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setUser(session.user);
      setLoading(false);
    };
    checkUser();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

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

  useEffect(() => {
    const setupUserProfile = async () => {
      if (user) {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (error) return console.error(error);
        if (data) {
          setUserCode(data.code); setUserName(data.username || ''); setUserAvatar(data.avatar_url || '');
          localStorage.setItem('myChatCode', data.code);
        }
      }
    };
    setupUserProfile();
  }, [user]);

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!authName.trim() || !authPass.trim()) return alert('نام کاربری و رمز را وارد کنید');
    if (authPass.length < 4) return alert('رمز باید حداقل ۴ کاراکتر باشد');

    setAuthLoading(true);
    const email = `${authName.toLowerCase()}@flw.local`;

    if (isLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: authPass });
      if (error) alert('نام کاربری یا رمز عبور اشتباه است!');
      else setUser(data.user);
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password: authPass });
      if (error) alert(error.message);
      else if (data.user) {
        const newCode = await generateUniqueCode();
        await supabase.from('profiles').insert({
          id: data.user.id, code: newCode, username: authName,
          username_login: authName, password_login: authPass
        });
        setUser(data.user);
      }
    }
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    if (window.confirm('آیا از حساب خود خارج می‌شوید؟')) {
      await supabase.auth.signOut();
      setUser(null); setUserCode(''); setUserName(''); setUserAvatar('');
      localStorage.removeItem('myChatCode');
    }
  };

  const fetchChatList = async () => {
    if (!user) return;
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('chat_id, content, image_url, audio_url, file_url, created_at, sender_id, is_read, deleted_for')
      .like('chat_id', `%${user.id}%`)
      .order('created_at', { ascending: false });
    if (error || !msgs) return;

    const visibleMsgs = msgs.filter(msg => !(msg.deleted_for || []).includes(user.id));
    const uniqueChats = {};
    const unreadCounts = {};
    visibleMsgs.forEach(msg => {
      if (!uniqueChats[msg.chat_id]) uniqueChats[msg.chat_id] = msg;
      if (msg.sender_id !== user.id && !msg.is_read) unreadCounts[msg.chat_id] = (unreadCounts[msg.chat_id] || 0) + 1;
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
        lastMessage: lastMsg.file_url ? '📎 فایل' : lastMsg.image_url ? '📷 عکس' : (lastMsg.audio_url ? '🎙️ پیام صوتی' : lastMsg.content),
        lastTime: new Date(lastMsg.created_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
        unreadCount: unreadCounts[chatId] || 0
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

  // 🔥 تابع اصلاح شده آپلود عکس پروفایل (بدون upsert)
  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const options = { maxSizeMB: 0.1, maxWidthOrHeight: 256, useWebWorker: true, fileType: 'image/webp' };
      const compressedFile = await imageCompression(file, options);
      
      // استفاده از نام یکتا برای جلوگیری از تداخل و خطای 400
      const filePath = `avatars/${user.id}-${Date.now()}.webp`;
      
      const { error: uploadError } = await supabase.storage.from('chat-images').upload(filePath, compressedFile);
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(filePath);
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (updateError) throw updateError;
      
      setUserAvatar(publicUrl);
      fetchChatList();
    } catch (error) {
      console.error('Avatar upload error:', error);
      alert('خطا در آپلود عکس! (کنسول را چک کنید)');
    } finally { setUploading(false); }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    const code = targetCode.trim().toUpperCase();
    if (code === userCode) return alert('این کد خودتان است!');
    const { data } = await supabase.from('profiles').select('id, code, username, avatar_url').eq('code', code).maybeSingle();
    if (data) openChat(data.id, data.code, data.username, data.avatar_url);
    else alert('کاربری پیدا نشد.');
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const { data, error } = await supabase.from('groups').insert({ name: newGroupName, creator_id: user.id }).select().single();
    if (!error && data) {
      await supabase.from('group_members').insert({ group_id: data.id, user_id: user.id });
      setGroupList(prev => [...prev, data]);
      setNewGroupName('');
      setSearchTab('user');
    }
  };

  const openChat = async (otherUid, otherCode, otherName, otherAvatar) => {
    const newChatId = [user.id, otherUid].sort().join('_');
    setChatUser({ uid: otherUid, code: otherCode, name: otherName, avatarUrl: otherAvatar });
    setGroupChat(null);
    setChatId(newChatId);
    setIsSearching(false); setTargetCode(''); setIsOtherTyping(false); setReplyingTo(null); setEditingMessage(null);
    await supabase.from('messages').update({ is_read: true }).eq('chat_id', newChatId).neq('sender_id', user.id).eq('is_read', false);
    setChatList(prev => prev.map(c => c.chatId === newChatId ? { ...c, unreadCount: 0 } : c));
    await checkBlockStatus(otherUid);
  };

  const openGroup = async (group) => {
    setGroupChat(group); setChatUser(null); setChatId(group.id); setIsSearching(false);
  };

  const checkBlockStatus = async (otherUid) => {
    const { data: myProfile } = await supabase.from('profiles').select('blocked_ids').eq('id', user.id).single();
    const { data: otherProfile } = await supabase.from('profiles').select('blocked_ids').eq('id', otherUid).single();
    setIsBlockedByMe(myProfile?.blocked_ids?.includes(otherUid) || false);
    setHasBlockedMe(otherProfile?.blocked_ids?.includes(user.id) || false);
  };

  useEffect(() => {
    if (!chatId) return;
    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
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
        if (payload.new.chat_id === chatId || payload.new.group_id === chatId) {
          setMessages((prev) => [...prev, { ...payload.new, reactions: payload.new.reactions || {} }]);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => prev.filter((msg) => msg.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        if (payload.new.chat_id === chatId || payload.new.group_id === chatId) {
          setMessages((prev) => {
            const updated = prev.map(msg => msg.id === payload.new.id ? { ...payload.new, reactions: payload.new.reactions || {} } : msg);
            return updated.filter(m => !(m.deleted_for || []).includes(user.id));
          });
        }
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
    return () => { supabase.removeChannel(channel); };
  }, [chatId, user]);

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    if (e.target.value.length > 0 && chatChannelRef.current) {
      chatChannelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: user.id } });
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAudio(audioBlob);
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) { alert('خطا در دسترسی به میکروفون!'); }
  };

  const stopRecording = (send = true) => {
    if (mediaRecorderRef.current && isRecording) {
      if (!send) mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const uploadAudio = async (blob) => {
    setUploading(true);
    try {
      const filePath = `${chatId}/${Date.now()}-audio.webm`;
      const { error: uploadError } = await supabase.storage.from('chat-images').upload(filePath, blob);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(filePath);
      await supabase.from('messages').insert({ chat_id: chatId, sender_id: user.id, content: '', audio_url: publicUrl, reply_to_id: replyingTo?.id || null, reactions: {} });
      setReplyingTo(null);
    } catch (error) { alert('خطا در آپلود صدا!'); } finally { setUploading(false); }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId) return;
    const msgText = newMessage;
    setNewMessage('');
    if (editingMessage) {
      await supabase.from('messages').update({ content: msgText, is_edited: true }).eq('id', editingMessage.id);
      setEditingMessage(null);
    } else {
      await supabase.from('messages').insert({ chat_id: chatId, sender_id: user.id, content: msgText, reply_to_id: replyingTo?.id || null, reactions: {} });
      setReplyingTo(null);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !chatId) return;
    setUploading(true);
    try {
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1280, useWebWorker: true, fileType: 'image/webp' };
      const compressedFile = await imageCompression(file, options);
      const filePath = `${chatId}/${Date.now()}-${Math.random()}.${compressedFile.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('chat-images').upload(filePath, compressedFile);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(filePath);
      await supabase.from('messages').insert({ chat_id: chatId, sender_id: user.id, content: '', image_url: publicUrl, reply_to_id: replyingTo?.id || null, reactions: {} });
      setReplyingTo(null);
    } catch (error) { alert('خطا در آپلود عکس!'); } finally { setUploading(false); }
  };

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
        chat_id: chatId, sender_id: user.id, content: '', 
        file_url: publicUrl, file_name: file.name, file_type: file.type,
        reply_to_id: replyingTo?.id || null, reactions: {} 
      });
      setReplyingTo(null);
    } catch (error) { alert('خطا در آپلود فایل!'); } finally { setUploading(false); }
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

  const getStoragePath = (url) => {
    if (!url) return null;
    try { return decodeURIComponent(new URL(url).pathname.split('/chat-images/')[1]); } catch { return null; }
  };

  const deleteMessage = async (msgId) => {
    if (window.confirm('حذف این پیام برای هر دو نفر؟')) {
      const msg = messages.find(m => m.id === msgId);
      const fileUrl = msg?.image_url || msg?.audio_url || msg?.file_url;
      if (fileUrl) { const path = getStoragePath(fileUrl); if (path) await supabase.storage.from('chat-images').remove([path]); }
      const { error } = await supabase.from('messages').delete().eq('id', msgId);
      if (!error) setMessages((prev) => prev.filter((m) => m.id !== msgId));
    }
  };

  const handleClearChat = async (mode) => {
    if (mode === 'me') {
      await supabase.rpc('delete_chat_for_user', { chat_id_param: chatId, user_id_param: user.id });
      setMessages([]); setChatUser(null); setGroupChat(null); setChatId(null);
    } else if (mode === 'both') {
      const { data: msgs } = await supabase.from('messages').select('image_url, audio_url, file_url').eq('chat_id', chatId);
      if (msgs) {
        const paths = msgs.map(m => getStoragePath(m.image_url || m.audio_url || m.file_url)).filter(Boolean);
        if (paths.length > 0) await supabase.storage.from('chat-images').remove(paths);
      }
      await supabase.from('messages').delete().eq('chat_id', chatId);
      setMessages([]); setChatUser(null); setGroupChat(null); setChatId(null);
    }
    setShowClearModal(false);
  };

  const addEmoji = (emoji) => { setNewMessage(prev => prev + emoji); };
  const copyCode = () => { navigator.clipboard.writeText(userCode); alert('کد کپی شد!'); };
  const formatTime = (timestamp) => { if (!timestamp) return ''; return new Date(timestamp).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }); };

  if (loading) return <div className="loading-screen">در حال اتصال...</div>;

  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <img src={logoImg} alt="Logo" className="auth-logo" />
          <h2>{isLogin ? 'ورود به F.L.W' : 'ثبت‌نام در F.L.W'}</h2>
          <p>برای استفاده از پیام‌رسان، وارد شوید یا ثبت‌نام کنید.</p>
          <form onSubmit={handleAuth}>
            <input type="text" placeholder="نام کاربری (انگلیسی)..." value={authName} onChange={(e) => setAuthName(e.target.value)} />
            <input type="password" placeholder="رمز عبور..." value={authPass} onChange={(e) => setAuthPass(e.target.value)} />
            <button type="submit" disabled={authLoading}>{authLoading ? 'صبر کنید...' : (isLogin ? 'ورود' : 'ثبت‌نام')}</button>
          </form>
          <p className="switch-auth" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'حساب ندارید؟ ثبت‌نام کنید' : 'قبلاً ثبت‌نام کردید؟ وارد شوید'}
          </p>
        </div>
      </div>
    );
  }

  const isOtherOnline = chatUser ? onlineUsers.includes(chatUser.uid) : false;

  return (
    <div className="app-container">
      <header className="header">
        <div className="profile-section">
          <div className="my-avatar" onClick={() => avatarInputRef.current.click()} title="برای تغییر عکس کلیک کنید">
            {uploading ? '⏳' : (userAvatar ? <img src={userAvatar} alt="avatar" /> : (userName ? userName.charAt(0) : '👤'))}
          </div>
          <input type="file" accept="image/*" ref={avatarInputRef} onChange={handleAvatarUpload} style={{ display: 'none' }} />
          
          {isEditingName ? (
            <div className="edit-name-box">
              <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="اسم شما..." maxLength={15} />
              <button onClick={saveName}>ذخیره</button>
            </div>
          ) : (
            <h2 onClick={() => setIsEditingName(true)} style={{ cursor: 'pointer', marginRight: '10px' }}>{userName || 'F.L.W ✎'}</h2>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="theme-toggle-btn" onClick={toggleTheme}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          <button className="logout-btn" onClick={handleLogout}>خروج</button>
          <div className="user-code-badge" onClick={copyCode}>{userCode || '...'}</div>
        </div>
      </header>

      {!chatUser && !groupChat ? (
        <div className="main-list-area">
          <div className="list-header">
            <div className="brand-logo-img"><img src={logoImg} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
            <button className="new-chat-btn" onClick={() => setIsSearching(!isSearching)}>{isSearching ? 'بستن' : 'چت جدید +'}</button>
          </div>

          {isSearching && (
            <div className="search-area">
              <div className="tabs">
                <button className={searchTab === 'user' ? 'active' : ''} onClick={() => setSearchTab('user')}>چت خصوصی</button>
                <button className={searchTab === 'group' ? 'active' : ''} onClick={() => setSearchTab('group')}>ساخت گروه</button>
              </div>
              {searchTab === 'user' ? (
                <form className="search-box" onSubmit={handleSearch}>
                  <input placeholder="کد اختصاصی..." value={targetCode} onChange={(e) => setTargetCode(e.target.value)} maxLength={6} />
                  <button type="submit">شروع</button>
                </form>
              ) : (
                <form className="search-box" onSubmit={handleCreateGroup}>
                  <input placeholder="نام گروه..." value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
                  <button type="submit">ساخت</button>
                </form>
              )}
            </div>
          )}

          <div className="chat-list">
            {chatList.length === 0 && groupList.length === 0 ? (
              <div className="empty-list">هنوز چتی ندارید.</div>
            ) : (
              <>
                {chatList.map(chat => (
                  <div key={chat.chatId} className="chat-list-item" onClick={() => openChat(chat.otherUid, chat.code, chat.name, chat.avatarUrl)}>
                    <div className="avatar-container">
                      <div className="avatar">{chat.avatarUrl ? <img src={chat.avatarUrl} /> : chat.name.charAt(0)}</div>
                      {onlineUsers.includes(chat.otherUid) && <div className="online-dot-list"></div>}
                    </div>
                    <div className="chat-info">
                      <div className="chat-name-time"><span className="chat-name">{chat.name}</span><span className="chat-time">{chat.lastTime}</span></div>
                      <div className="chat-last-msg-row"><div className="chat-last-msg">{chat.lastMessage}</div>{chat.unreadCount > 0 && <div className="unread-badge">{chat.unreadCount}</div>}</div>
                    </div>
                  </div>
                ))}
                {groupList.map(group => (
                  <div key={group.id} className="chat-list-item" onClick={() => openGroup(group)}>
                    <div className="avatar-container"><div className="avatar group-avatar">👥</div></div>
                    <div className="chat-info">
                      <div className="chat-name-time"><span className="chat-name">{group.name}</span><span className="chat-time">گروه</span></div>
                      <div className="chat-last-msg">گروه ساخته شد</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="chat-container">
          <div className="chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="avatar-small">{chatUser?.avatarUrl ? <img src={chatUser.avatarUrl} /> : (groupChat ? '👥' : '?')}</div>
              <div>
                <h3 style={{ margin: 0 }}>{groupChat ? groupChat.name : (chatUser?.name || `چت با ${chatUser?.code}`)}</h3>
                {!groupChat && <div className="status-text">{isOtherTyping ? <span className="typing-text">در حال تایپ...</span> : isOtherOnline ? <span className="online-text">آنلاین</span> : <span className="offline-text">آفلاین</span>}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button className="block-btn" onClick={() => setShowClearModal(true)}>🗑️</button>
              <button className="back-btn" onClick={() => { setChatUser(null); setGroupChat(null); setChatId(null); setMessages([]); }}>بستن ✕</button>
            </div>
          </div>

          {showClearModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h3>حذف تاریخچه</h3>
                <div className="modal-actions">
                  <button className="btn-me" onClick={() => handleClearChat('me')}>فقط برای من</button>
                  <button className="btn-both" onClick={() => handleClearChat('both')}>برای هر دو</button>
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
                    
                    {msg.file_url ? (
                      <div className="file-message">
                        <span>📎 {msg.file_name}</span>
                        <a href={msg.file_url} download target="_blank" className="download-btn">⬇️ دانلود</a>
                      </div>
                    ) : msg.audio_url ? (
                      <div className="audio-message"><audio controls src={msg.audio_url} className="voice-player" /><a href={msg.audio_url} download className="download-icon">⬇️</a></div>
                    ) : msg.image_url ? (
                      <div className="image-message"><img src={msg.image_url} className="chat-image" /><a href={msg.image_url} download className="download-icon">⬇️</a></div>
                    ) : ( msg.content )}

                    <div className="message-meta">{msg.is_edited && <span className="edited-tag">(ویرایش شده)</span>}</div>
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
                      {isMe && !msg.audio_url && !msg.file_url && <span className="action-btn" onClick={() => { setEditingMessage(msg); setNewMessage(msg.content); }} title="ویرایش">✏️</span>}
                      <span className="action-btn" onClick={() => deleteMessage(msg.id)} title="حذف">🗑️</span>
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
                  {editingMessage ? 'در حال ویرایش پیام' : (replyingTo.sender_id === user.id ? 'پاسخ به خودتان' : `پاسخ به ${chatUser?.name || 'طرف مقابل'}`)}
                </span>
                <span className="reply-banner-text">{editingMessage ? editingMessage.content : (replyingTo.file_url ? '📎 فایل' : replyingTo.image_url ? '📷 عکس' : (replyingTo.audio_url ? '🎙️ ویس' : replyingTo.content))}</span>
              </div>
              <button className="cancel-reply-btn" onClick={() => { setReplyingTo(null); setEditingMessage(null); setNewMessage(''); }}>✕</button>
            </div>
          )}

          <div className="input-area">
            {isRecording ? (
              <div className="recording-ui">
                <span className="recording-dot"></span><span className="recording-text">در حال ضبط...</span>
                <button className="stop-record-btn" onClick={() => stopRecording(true)}>⏹️ ارسال</button>
                <button className="cancel-record-btn" onClick={() => stopRecording(false)}>✕ لغو</button>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="input-form">
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
                <input type="file" accept="*/*" ref={docInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                
                <button type="button" className="attach-btn" onClick={() => fileInputRef.current.click()} disabled={uploading} title="عکس">🖼️</button>
                <button type="button" className="attach-btn" onClick={() => docInputRef.current.click()} disabled={uploading} title="فایل/ویدیو">📎</button>
                
                <div style={{ position: 'relative' }}>
                  <button type="button" className="emoji-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>😊</button>
                  {showEmojiPicker && (
                    <div className="emoji-picker">
                      {EMOJIS.map(e => <span key={e} onClick={() => addEmoji(e)}>{e}</span>)}
                    </div>
                  )}
                </div>

                <input type="text" placeholder="پیام..." value={newMessage} onChange={handleTyping} />
                
                {newMessage.trim() ? (
                  <button type="submit" className="send-btn"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg></button>
                ) : (
                  <button type="button" className="send-btn mic-btn" onClick={startRecording}>🎙️</button>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;