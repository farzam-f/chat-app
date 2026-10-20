import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db, signInAnonymously } from './firebase';
import { 
  doc, getDoc, setDoc, collection, query, orderBy, 
  addDoc, onSnapshot, serverTimestamp 
} from 'firebase/firestore';
import './App.css';

function App() {
  const [user, loading] = useAuthState(auth);
  const [userCode, setUserCode] = useState('');
  const [targetCode, setTargetCode] = useState('');
  const [chatUser, setChatUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatId, setChatId] = useState(null);

  // ۱. لاگین خودکار ناشناس (بدون هیچ پاپ‌آپی)
  useEffect(() => {
    if (!user && !loading) {
      signInAnonymously(auth).catch((error) => {
        console.error("خطا در اتصال به سرور:", error);
      });
    }
  }, [user, loading]);

  // تولید کد اختصاصی ۶ رقمی
  const generateUniqueCode = async () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const codeRef = doc(db, 'userCodes', code);
    const docSnap = await getDoc(codeRef);
    return docSnap.exists() ? generateUniqueCode() : code;
  };

  // ۲. تنظیم کد کاربر (بررسی اینکه قبلاً کد داشته یا نه)
  useEffect(() => {
    const setupUserCode = async () => {
      if (user) {
        // اول ببینیم توی حافظه مرورگر کدی ذخیره شده یا نه
        let localCode = localStorage.getItem('myChatCode');
        
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          // اگر کاربر جدید بود
          if (!localCode) {
            localCode = await generateUniqueCode();
            localStorage.setItem('myChatCode', localCode); // ذخیره در مرورگر
          }
          await setDoc(userRef, { code: localCode });
          await setDoc(doc(db, 'userCodes', localCode), { uid: user.uid });
          setUserCode(localCode);
        } else {
          // اگر کاربر قبلاً ثبت‌نام کرده بود
          setUserCode(userSnap.data().code);
          localStorage.setItem('myChatCode', userSnap.data().code);
        }
      }
    };
    setupUserCode();
  }, [user]);

  // جستجوی کاربر
  const handleSearch = async () => {
    const code = targetCode.trim().toUpperCase();
    if (code === userCode) return alert('این کد خودتان است!');
    
    const codeRef = doc(db, 'userCodes', code);
    const codeSnap = await getDoc(codeRef);
    
    if (codeSnap.exists()) {
      const otherUid = codeSnap.data().uid;
      const newChatId = [user.uid, otherUid].sort().join('_');
      setChatUser({ uid: otherUid, code: code });
      setChatId(newChatId);
    } else {
      alert('کاربری با این کد پیدا نشد.');
    }
  };

  // دریافت پیام‌ها
  useEffect(() => {
    if (!chatId) return;
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [chatId]);

  // ارسال پیام
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId) return;
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      text: newMessage,
      senderId: user.uid,
      createdAt: serverTimestamp(),
    });
    setNewMessage('');
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'Tahoma' }}>در حال اتصال به سرور...</div>;

  // اگر هنوز کاربر ساخته نشده، فقط لودینگ نشان بده
  if (!user) {
    return <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'Tahoma' }}>در حال ساخت حساب کاربری...</div>;
  }

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
      
      {/* بخش جستجو */}
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

      {/* بخش چت */}
      {chatUser && (
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '10px' }}>
          <h3>چت با {chatUser.code}</h3>
          <div style={{ border: '1px solid #ddd', height: '300px', overflowY: 'scroll', padding: '10px', marginBottom: '10px', background: '#fafafa' }}>
            {messages.map(msg => (
              <div key={msg.id} style={{ textAlign: msg.senderId === user.uid ? 'left' : 'right', margin: '5px 0' }}>
                <span style={{ background: msg.senderId === user.uid ? '#dcf8c6' : '#fff', padding: '8px 12px', borderRadius: '15px', display: 'inline-block', border: '1px solid #ddd' }}>
                  {msg.text}
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