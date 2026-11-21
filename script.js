// Daftarkan Service Worker PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Konfigurasi API Key (Base64) & Model Fallback
const ENCODED_API_KEY = 'QVEuQWI4Uk42SS1WeVBicS1LNENNdHBtemR6SG44WXpFY0w2ZjdEQ1RsWVVFaGZLZzRjZFE='; // Isi dengan btoa("AIzaSy...") milikmu
const MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash-lite'];
const VALID_VOUCHERS = ['SYNTHPRO26', 'UJIANLULUS', 'PELAJARPRO'];
const FREE_DAILY_LIMIT = 3;

// State Aplikasi
let state = {
  isPro: localStorage.getItem('synthnote_pro') === 'true',
  quota: getDailyQuota(),
  history: JSON.parse(localStorage.getItem('synthnote_history') || '[]'),
  selectedImage: null // { base64, mimeType, name }
};

function getDailyQuota() {
  const today = new Date().toISOString().slice(0, 10);
  const saved = JSON.parse(localStorage.getItem('synthnote_quota') || '{}');
  if (saved.date !== today) {
    const fresh = { date: today, used: 0 };
    localStorage.setItem('synthnote_quota', JSON.stringify(fresh));
    return fresh;
  }
  return saved;
}

function saveQuota() {
  localStorage.setItem('synthnote_quota', JSON.stringify(state.quota));
  updateTierUI();
}

function updateTierUI() {
  const badge = document.getElementById('tierBadge');
  const quotaEl = document.getElementById('quotaDisplay');
  const navUpgradeBtn = document.getElementById('navUpgradeBtn');
  const stayFreeBtn = document.getElementById('stayFreeBtn');

  if (state.isPro) {
    badge.textContent = 'PRO';
    badge.className = 'badge badge-pro';
    quotaEl.textContent = 'Kuota: Unlimited (Pro)';
    navUpgradeBtn.textContent = 'Info Paket Pro';
    stayFreeBtn.textContent = 'Paket Pro Sudah Aktif';
  } else {
    badge.textContent = 'FREE';
    badge.className = 'badge badge-free';
    const sisa = Math.max(0, FREE_DAILY_LIMIT - state.quota.used);
    quotaEl.textContent = `Kuota hari ini: ${sisa}/${FREE_DAILY_LIMIT}`;
    navUpgradeBtn.textContent = 'Upgrade Pro';
    stayFreeBtn.textContent = 'Paket Saat Ini (Free)';
  }
}

// Navigasi Halaman (Main View <-> Upgrade View)
const mainView = document.getElementById('mainView');
const upgradeView = document.getElementById('upgradeView');

function showUpgradePage() {
  mainView.classList.add('hidden');
  upgradeView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showMainPage() {
  upgradeView.classList.add('hidden');
  mainView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('navUpgradeBtn').onclick = showUpgradePage;
document.getElementById('backToMainBtn').onclick = showMainPage;
document.getElementById('stayFreeBtn').onclick = showMainPage;
document.getElementById('goHomeBrand').onclick = showMainPage;

// Penanganan Upload & Preview Gambar
const imageInput = document.getElementById('imageInput');
const imagePreviewBox = document.getElementById('imagePreviewBox');
const imagePreview = document.getElementById('imagePreview');
const imageName = document.getElementById('imageName');

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const base64Data = dataUrl.split(',')[1];
    state.selectedImage = {
      base64: base64Data,
      mimeType: file.type || 'image/jpeg',
      name: file.name
    };
    imagePreview.src = dataUrl;
    imageName.textContent = file.name;
    imagePreviewBox.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

document.getElementById('removeImageBtn').onclick = () => {
  state.selectedImage = null;
  imageInput.value = '';
  imagePreviewBox.classList.add('hidden');
};

// Navigasi Tab Hasil
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// Aktivasi Kode Voucher Pro
document.getElementById('redeemBtn').onclick = () => {
  const code = document.getElementById('voucherInput').value.trim().toUpperCase();
  const msg = document.getElementById('voucherMsg');
  if (VALID_VOUCHERS.includes(code)) {
    state.isPro = true;
    localStorage.setItem('synthnote_pro', 'true');
    updateTierUI();
    msg.style.color = '#22c55e';
    msg.textContent = 'Berhasil! Akun kamu telah di-upgrade ke SynthNote Pro.';
    setTimeout(() => showMainPage(), 1200);
  } else {
    msg.style.color = '#ef4444';
    msg.textContent = 'Kode voucher tidak valid. Periksa kembali kode yang dimasukkan.';
  }
};

// Pemanggilan Gemini API (Multimodal: Teks + Gambar)
async function callGemini(noteText, imageObj) {
  if (!ENCODED_API_KEY) {
    throw new Error('API Key belum diisi di script.js (ENCODED_API_KEY).');
  }
  const apiKey = atob(ENCODED_API_KEY);
  const quizCount = state.isPro ? 7 : 3;

  const instruction = `Kamu adalah asisten belajar pelajar Indonesia. Analisis materi dari teks dan/atau gambar catatan yang diberikan, lalu ubah menjadi JSON valid tanpa markdown backticks dengan struktur persis:
{
  "title": "Judul Singkat Topik",
  "mindmap": [
    { "branch": "Subtopik Utama", "points": ["poin 1", "poin 2"] }
  ],
  "summary": ["poin ringkasan 1", "poin ringkasan 2", "poin ringkasan 3"],
  "quiz": [
    {
      "question": "Pertanyaan latihan?",
      "options": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
      "answerIndex": 0,
      "explanation": "Penjelasan singkat jawaban benar"
    }
  ]
}
Buat ${quizCount} soal latihan. ${noteText ? `Catatan tambahan pengguna:\n${noteText}` : 'Ekstrak seluruh materi penting dari gambar catatan yang dilampirkan.'}`;

  const parts = [{ text: instruction }];
  if (imageObj) {
    parts.push({
      inline_data: {
        mime_type: imageObj.mimeType,
        data: imageObj.base64
      }
    });
  }

  let lastError = null;
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status} (${model})`);
      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return JSON.parse(rawText);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// Render Hasil ke Tampilan
function renderResult(data) {
  document.getElementById('resultSection').classList.remove('hidden');

  const mmContainer = document.getElementById('tab-mindmap');
  mmContainer.innerHTML = `<div class="mindmap-tree">
    <div class="mm-root">${data.title}</div>
    ${data.mindmap
      .map(
        (b) => `<div class="mm-branch">
          <div class="mm-topic">${b.branch}</div>
          <ul class="mm-sub">${b.points.map((p) => `<li>${p}</li>`).join('')}</ul>
        </div>`
      )
      .join('')}
  </div>`;

  const sumContainer = document.getElementById('tab-summary');
  sumContainer.innerHTML = `<ul class="mm-sub" style="margin-left:18px; display:flex; flex-direction:column; gap:8px;">
    ${data.summary.map((s) => `<li>${s}</li>`).join('')}
  </ul>`;

  const quizContainer = document.getElementById('tab-quiz');
  quizContainer.innerHTML = data.quiz
    .map(
      (q, idx) => `<div class="quiz-item" data-ans="${q.answerIndex}">
        <div class="quiz-q">${idx + 1}. ${q.question}</div>
        ${q.options
          .map(
            (opt, oIdx) =>
              `<button class="quiz-opt" onclick="checkAnswer(this, ${oIdx})">${String.fromCharCode(65 + oIdx)}. ${opt}</button>`
          )
          .join('')}
        <div class="quiz-exp">Pembahasan: ${q.explanation}</div>
      </div>`
    )
    .join('');
}

window.checkAnswer = function (btn, selectedIdx) {
  const parent = btn.closest('.quiz-item');
  if (parent.dataset.answered) return;
  parent.dataset.answered = 'true';

  const correctIdx = Number(parent.dataset.ans);
  const buttons = parent.querySelectorAll('.quiz-opt');
  buttons.forEach((b, i) => {
    if (i === correctIdx) b.classList.add('correct');
    else if (i === selectedIdx) b.classList.add('wrong');
  });
  parent.querySelector('.quiz-exp').style.display = 'block';
};

// Riwayat Belajar Offline
function renderHistory() {
  const list = document.getElementById('historyList');
  if (!state.history.length) {
    list.innerHTML = '<p class="quota-info">Belum ada materi yang dibuat.</p>';
    return;
  }
  list.innerHTML = state.history
    .map(
      (item, i) => `<div class="history-item" onclick="loadHistory(${i})">
        <div>
          <strong>${item.title}</strong>
          <div class="quota-info">${item.date}</div>
        </div>
        <span style="color: var(--primary); font-size: 0.85rem;">Buka &rarr;</span>
      </div>`
    )
    .join('');
}

window.loadHistory = function (idx) {
  renderResult(state.history[idx]);
  window.scrollTo({ top: document.getElementById('resultSection').offsetTop - 70, behavior: 'smooth' });
};

document.getElementById('clearHistoryBtn').onclick = () => {
  state.history = [];
  localStorage.removeItem('synthnote_history');
  renderHistory();
};

// Tombol Generate Utama
document.getElementById('generateBtn').onclick = async () => {
  const text = document.getElementById('noteInput').value.trim();
  const status = document.getElementById('statusMsg');
  const btn = document.getElementById('generateBtn');

  if (!text && !state.selectedImage) {
    status.textContent = 'Masukkan teks catatan atau unggah foto materi terlebih dahulu.';
    return;
  }

  if (!state.isPro && state.quota.used >= FREE_DAILY_LIMIT) {
    status.textContent = 'Kuota gratis hari ini habis. Mengalihkan ke halaman Upgrade...';
    setTimeout(() => showUpgradePage(), 700);
    return;
  }

  btn.disabled = true;
  status.textContent = state.selectedImage
    ? 'AI sedang membaca foto catatan & menyusun peta konsep...'
    : 'AI sedang menyusun peta konsep & kuis...';

  try {
    const result = await callGemini(text, state.selectedImage);
    if (!state.isPro) {
      state.quota.used += 1;
      saveQuota();
    }

    const maxHistory = state.isPro ? 50 : 5;
    const entry = { ...result, date: new Date().toLocaleDateString('id-ID') };
    state.history.unshift(entry);
    state.history = state.history.slice(0, maxHistory);
    localStorage.setItem('synthnote_history', JSON.stringify(state.history));

    renderResult(result);
    renderHistory();
    status.textContent = 'Selesai! Pilih tab di bawah untuk belajar.';
  } catch (err) {
    status.textContent = `Gagal memproses: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
};

// Inisialisasi Awal
updateTierUI();
renderHistory();
