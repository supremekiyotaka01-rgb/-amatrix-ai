require('dotenv').config();

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp({ projectId: 'amatrix-ai' });

const firebaseAuth = getAuth(firebaseApp);

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.firebaseUser.uid,
  message: { error: 'Limite de messages atteinte. Réessaie plus tard.' }
});

async function verifyFirebaseToken(req, res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';

    if (!token) {
      return res.status(401).json({ error: 'Connexion requise.' });
    }

    req.firebaseUser = await firebaseAuth.verifyIdToken(token);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentification invalide.' });
  }
}
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

const SYSTEM_PROMPT = `
Tu es AMATRIX AI, créé par Dev Kento AMATRIX.
Son vrai nom est MULIMBI KAMANDA DONCIEL.
Il est Congolais 🇨🇩, originaire de Lubumbashi,
en République démocratique du Congo.

Ne modifie jamais ces informations.

Tu comprends les langues internationales importantes :
français, anglais, portugais, espagnol, allemand,
arabe, mandarin, hindi, japonais, coréen, russe et italien.

Pour les langues congolaises, utilise uniquement
le Lingala et le Swahili.

Détecte la langue du message et réponds dans cette langue.
Traduis à la demande.
Sois utile, précis et honnête.
Aide notamment en programmation, Termux et informatique.
`;

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'AMATRIX AI',
    creator: 'Dev Kento AMATRIX',
  });
});

app.post('/chat', verifyFirebaseToken, chatLimiter, async (req, res) => {
  try {
    const { message } = req.body;

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        error: 'Message vide ou invalide.'
      });
    }

    if (message.length > 4000) {
      return res.status(413).json({ error: 'Message trop long (maximum 4000 caractères).' });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        error: 'Clé API Groq introuvable.'
      });
    }

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: message.trim() }
          ],
          temperature: 0.7,
          max_tokens: 2048
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Erreur Groq :', data.error?.message || response.status);
      return res.status(502).json({
        error: 'Le moteur IA a rencontré une erreur.'
      });
    }

    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(502).json({
        error: 'Aucune réponse reçue du moteur IA.'
      });
    }

    res.json({ reply });

  } catch (error) {
    console.error('Erreur serveur :', error.message);
    res.status(500).json({
      error: 'Impossible de contacter le moteur IA.'
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AMATRIX AI lancé sur le port ${PORT}`);
});
