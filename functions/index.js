const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// 단일 화폐 코드(원하는 코드로 고정)
const CURRENCY = 'KRW';

/**
 * 최초 로그인 시 사용자/계좌 보장:
 * - /users/{uid} 없으면 생성
 * - /accounts/{uid} 없으면 생성 (balances: {KRW: 0})
 */
exports.ensureAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인 필요');
  const uid = context.auth.uid;

  const userRef = db.collection('users').doc(uid);
  const accRef = db.collection('accounts').doc(uid);

  await db.runTransaction(async (tx) => {
    const u = await tx.get(userRef);
    if (!u.exists) {
      tx.set(userRef, {
        uid,
        email: context.auth.token.email || null,
        username: null,            // 최초엔 없음
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    const a = await tx.get(accRef);
    if (!a.exists) {
      tx.set(accRef, {
        accountId: uid,
        ownerUid: uid,
        balances: { [CURRENCY]: 0 },
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  });

  return { ok: true };
});

/**
 * username 설정(최초 1회/변경 제한 권장): 유니크 보장
 */
exports.setUsername = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인 필요');
  const uid = context.auth.uid;
  const { username } = data;
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    throw new functions.https.HttpsError('invalid-argument', 'username은 3자 이상 문자열이어야 함');
  }
  const uname = username.trim();

  // 유니크 검사
  const dup = await db.collection('users').where('username', '==', uname).limit(1).get();
  if (!dup.empty) {
    const existId = dup.docs[0].id;
    if (existId !== uid) {
      throw new functions.https.HttpsError('already-exists', '이미 사용 중인 사용자명');
    }
  }

  await db.collection('users').doc(uid).set({ username: uname }, { merge: true });
  return { ok: true, username: uname };
});

/**
 * 송금(같은 화폐, 정수 금액. 서버 트랜잭션으로 원자성 보장)
 * 입력: { toUsername: string, amount: number }
 */
exports.sendTransaction = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인 필요');
  const fromUid = context.auth.uid;
  const { toUsername, amount } = data;

  if (!toUsername || typeof amount !== 'number') {
    throw new functions.https.HttpsError('invalid-argument', '파라미터 부족');
  }
  const amt = Math.floor(amount);
  if (amt <= 0) throw new functions.https.HttpsError('invalid-argument', '금액은 0보다 커야 함');

  // 수신자 username -> uid
  const usersSnap = await db.collection('users').where('username', '==', toUsername).limit(1).get();
  if (usersSnap.empty) throw new functions.https.HttpsError('not-found', '받는 사람 계정이 존재하지 않습니다.');
  const toUid = usersSnap.docs[0].id;

  // 자기 자신 송금 금지(허용하려면 제거)
  if (toUid === fromUid) {
    throw new functions.https.HttpsError('failed-precondition', '자기 자신에게는 송금할 수 없습니다.');
  }

  const fromAccRef = db.collection('accounts').doc(fromUid);
  const toAccRef = db.collection('accounts').doc(toUid);

  const txDocRef = db.collection('transactions').doc();

  await db.runTransaction(async (tx) => {
    const fromSnap = await tx.get(fromAccRef);
    const toSnap = await tx.get(toAccRef);

    if (!fromSnap.exists || !toSnap.exists) {
      throw new functions.https.HttpsError('not-found', '계좌 정보 없음');
    }

    const fromData = fromSnap.data();
    const toData = toSnap.data();
    const fromBal = (fromData.balances && fromData.balances[CURRENCY]) || 0;
    const toBal = (toData.balances && toData.balances[CURRENCY]) || 0;

    if (fromBal < amt) throw new functions.https.HttpsError('failed-precondition', '잔고 부족');

    tx.update(fromAccRef, { [`balances.${CURRENCY}`]: fromBal - amt });
    tx.update(toAccRef,   { [`balances.${CURRENCY}`]: toBal + amt });

    tx.set(txDocRef, {
      txId: txDocRef.id,
      fromAccountId: fromUid,
      toAccountId: toUid,
      amount: amt,
      currency: CURRENCY,
      status: 'completed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: { initiatedBy: fromUid }
    });
  });

  return { ok: true, txId: txDocRef.id };
});

/**
 * 관리자: 전체 거래 조회 (최신순, limit 지원)
 * custom claim: { admin: true } 필요
 */
exports.getAllTransactionsForAdmin = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인 필요');
  if (!context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', '관리자 권한 필요');
  }
  const limit = (data && data.limit) ? Math.min(data.limit, 500) : 200;
  const snaps = await db.collection('transactions').orderBy('createdAt', 'desc').limit(limit).get();
  const rows = snaps.docs.map(d => ({ id: d.id, ...d.data() }));
  return { transactions: rows };
});
