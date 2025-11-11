import React, { useEffect, useState } from 'react';
import { auth, db, functions } from './firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

const KRW = 'KRW';

function App(){
  const [user, setUser] = useState(null);
  const [account, setAccount] = useState(null);
  const [username, setUsername] = useState('');
  const [myUsername, setMyUsername] = useState(null);
  const [toUsername, setToUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTxs, setAdminTxs] = useState([]);

  // 로그인 상태 구독
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setMsg('');
      setAccount(null);
      setIsAdmin(false);
      setAdminTxs([]);
      if (u) {
        // 서버에서 user/acc 보장
        const ensure = httpsCallable(functions, 'ensureAccount');
        await ensure({});

        // username/claim 확인
        const userRef = doc(db, 'users', u.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          setMyUsername(snap.data().username || null);
        } else {
          setMyUsername(null);
        }

        // admin claim 확인
        const token = await u.getIdTokenResult();
        if (token?.claims?.admin) setIsAdmin(true);

        // 계좌 실시간 구독
        const accRef = doc(db, 'accounts', u.uid);
        const unsub = onSnapshot(accRef, (s) => {
          if (s.exists()) setAccount(s.data());
        });
        return () => unsub();
      }
    });
  }, []);

  async function handleRegister(e){
    e.preventDefault();
    setMsg('');
    const email = e.target.email.value.trim();
    const pw = e.target.pw.value;
    if (!email || !pw) { setMsg('이메일/비밀번호 입력'); return; }
    try{
      await createUserWithEmailAndPassword(auth, email, pw);
      setMsg('가입 성공. 로그인 상태입니다.');
    }catch(err){
      setMsg(err.message);
    }
  }

  async function handleLogin(e){
    e.preventDefault();
    setMsg('');
    const email = e.target.email.value.trim();
    const pw = e.target.pw.value;
    if (!email || !pw) { setMsg('이메일/비밀번호 입력'); return; }
    try{
      await signInWithEmailAndPassword(auth, email, pw);
      setMsg('로그인 성공');
    }catch(err){
      setMsg(err.message);
    }
  }

  async function handleLogout(){
    await signOut(auth);
    setMsg('로그아웃');
  }

  async function handleSetUsername(){
    setMsg('');
    if (!user) { setMsg('로그인 필요'); return; }
    const uname = username.trim();
    if (uname.length < 3) { setMsg('사용자명은 3자 이상'); return; }
    try{
      const setU = httpsCallable(functions, 'setUsername');
      const res = await setU({ username: uname });
      setMyUsername(res.data.username);
      setUsername('');
      setMsg('사용자명 설정 완료');
    }catch(err){
      setMsg(err.message || err.code);
    }
  }

  async function handleSend(){
    setMsg('');
    if (!user) { setMsg('로그인 필요'); return; }
    if (!myUsername) { setMsg('먼저 사용자명을 설정하세요.'); return; }
    const to = toUsername.trim();
    const amt = Math.floor(Number(amount));
    if (!to || !amt || amt <= 0) { setMsg('받는사람/금액 확인'); return; }

    try{
      const sendFn = httpsCallable(functions, 'sendTransaction');
      await sendFn({ toUsername: to, amount: amt });
      setMsg(`송금 완료: ${amt.toLocaleString()} ${KRW} → ${to}`);
      setToUsername('');
      setAmount('');
    }catch(err){
      setMsg(err.message || err.code);
    }
  }

  async function loadAdminTxs(){
    setMsg('');
    try{
      const fn = httpsCallable(functions, 'getAllTransactionsForAdmin');
      const { data } = await fn({ limit: 200 });
      setAdminTxs(data.transactions || []);
      setMsg(`관리자 조회: ${data.transactions.length}건`);
    }catch(err){
      setMsg(err.message || err.code);
    }
  }

  const balance = account?.balances?.[KRW] ?? 0;

  return (
    <div style={{maxWidth:900, margin:'24px auto', padding:'16px', fontFamily:'system-ui, -apple-system, Segoe UI, Roboto, Noto Sans KR, Arial'}}>
      <h1 style={{margin:'0 0 12px'}}>가상은행 데모 (단일 화폐: {KRW})</h1>

      {!user ? (
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px'}}>
          <form onSubmit={handleLogin} style={{padding:'12px', border:'1px solid #e5e7eb', borderRadius:8}}>
            <h3>로그인</h3>
            <input name="email" placeholder="이메일" style={{width:'100%', padding:8, marginBottom:8}} />
            <input name="pw" type="password" placeholder="비밀번호" style={{width:'100%', padding:8, marginBottom:8}} />
            <button>로그인</button>
          </form>
          <form onSubmit={handleRegister} style={{padding:'12px', border:'1px solid #e5e7eb', borderRadius:8}}>
            <h3>회원가입</h3>
            <input name="email" placeholder="이메일" style={{width:'100%', padding:8, marginBottom:8}} />
            <input name="pw" type="password" placeholder="비밀번호" style={{width:'100%', padding:8, marginBottom:8}} />
            <button>가입하기</button>
          </form>
        </div>
      ) : (
        <>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
            <div>
              <div style={{fontSize:18, fontWeight:700}}>안녕하세요, {user.email}</div>
              <div style={{color:'#6b7280'}}>내 사용자명: {myUsername || '미설정'}</div>
            </div>
            <div>
              <button onClick={handleLogout}>로그아웃</button>
            </div>
          </div>

          {!myUsername && (
            <div style={{padding:'12px', border:'1px solid #fde68a', background:'#fffbeb', borderRadius:8, marginBottom:12}}>
              <div style={{marginBottom:8}}>송금 받기 위해 <b>사용자명</b>을 먼저 설정하세요.</div>
              <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="예: alice" style={{padding:8, marginRight:8}} />
              <button onClick={handleSetUsername}>설정</button>
            </div>
          )}

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px'}}>
            <div style={{padding:'12px', border:'1px solid #e5e7eb', borderRadius:8}}>
              <h3 style={{marginTop:0}}>내 잔고</h3>
              <div style={{fontSize:24, fontWeight:700}}>{balance.toLocaleString()} {KRW}</div>
              <div style={{fontSize:12, color:'#6b7280'}}>※ 최소단위 정수로 저장/표시</div>
            </div>

            <div style={{padding:'12px', border:'1px solid #e5e7eb', borderRadius:8}}>
              <h3 style={{marginTop:0}}>송금</h3>
              <input placeholder="받는 사람 사용자명" value={toUsername} onChange={e=>setToUsername(e.target.value)} style={{width:'100%', padding:8, marginBottom:8}} />
              <input placeholder="금액(정수)" value={amount} onChange={e=>setAmount(e.target.value)} style={{width:'100%', padding:8, marginBottom:8}} />
              <button onClick={handleSend}>송금하기</button>
            </div>
          </div>

          {isAdmin && (
            <div style={{marginTop:16, padding:'12px', border:'1px solid #d1fae5', background:'#ecfdf5', borderRadius:8}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <h3 style={{marginTop:0}}>관리자: 전체 거래 조회</h3>
                <button onClick={loadAdminTxs}>불러오기</button>
              </div>
              <div style={{maxHeight:300, overflow:'auto', background:'#fff', border:'1px solid #e5e7eb', borderRadius:8}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:14}}>
                  <thead>
                    <tr style={{background:'#f3f4f6'}}>
                      <th style={{textAlign:'left', padding:8, borderBottom:'1px solid #e5e7eb'}}>시간</th>
                      <th style={{textAlign:'left', padding:8, borderBottom:'1px solid #e5e7eb'}}>from</th>
                      <th style={{textAlign:'left', padding:8, borderBottom:'1px solid #e5e7eb'}}>to</th>
                      <th style={{textAlign:'right', padding:8, borderBottom:'1px solid #e5e7eb'}}>금액({KRW})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminTxs.map(t => (
                      <tr key={t.id}>
                        <td style={{padding:8, borderBottom:'1px solid #f3f4f6'}}>{t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString() : ''}</td>
                        <td style={{padding:8, borderBottom:'1px solid #f3f4f6'}}>{t.fromAccountId}</td>
                        <td style={{padding:8, borderBottom:'1px solid #f3f4f6'}}>{t.toAccountId}</td>
                        <td style={{padding:8, textAlign:'right', borderBottom:'1px solid #f3f4f6'}}>{Number(t.amount).toLocaleString()}</td>
                      </tr>
                    ))}
                    {adminTxs.length === 0 && (
                      <tr><td colSpan="4" style={{padding:8}}>거래 없음</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{fontSize:12, color:'#065f46', marginTop:8}}>
                * UID 대신 사용자명을 함께 보려면, 관리자 테이블에 users 컬렉션을 조인해 매핑하는 로직을 추가하면 됩니다.
              </div>
            </div>
          )}

          <div style={{marginTop:12, color: msg.startsWith('송금') || msg.includes('완료') ? '#065f46' : '#7f1d1d'}}>
            {msg}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
