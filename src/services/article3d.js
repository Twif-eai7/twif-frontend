import { supabase } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, '') || ''
const MOCK = import.meta.env.VITE_ARTICLE_3D_MOCK === 'true'
const SAMPLE_GLB = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb'
const MOCK_READY_MS = 45_000
const FAIL_ERROR = 'This photo could not be turned into a model. Try a single product on a plain background.'

const mockJobs = new Map()

async function requireToken() {
  if (!supabase) throw new Error('Sign in required')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in required')
  return session.access_token
}

async function throwIfNotOk(res) {
  if (res.ok) return
  const body = await res.json().catch(() => ({}))
  throw new Error(body.error || `HTTP ${res.status}`)
}

function mockCreate(file) {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  mockJobs.set(id, {
    createdAt,
    fail: file.name.toLowerCase().includes('fail'),
  })
  return { id, status: 'processing', createdAt }
}

function mockGet(id) {
  const job = mockJobs.get(id)
  if (!job) throw new Error('HTTP 404')
  const processing = Date.now() - Date.parse(job.createdAt) < MOCK_READY_MS
  if (processing) {
    return { id, status: 'processing', error: null, createdAt: job.createdAt }
  }
  if (job.fail) {
    return { id, status: 'failed', error: FAIL_ERROR, createdAt: job.createdAt }
  }
  return { id, status: 'ready', error: null, createdAt: job.createdAt }
}

export async function createArticle3dJob(file) {
  if (MOCK) return mockCreate(file)

  const token = await requireToken()
  const body = new FormData()
  body.append('photo', file)
  const res = await fetch(`${API_BASE}/article-3d/jobs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  })
  await throwIfNotOk(res)
  return res.json()
}

export async function getArticle3dJob(id) {
  if (MOCK) return mockGet(id)

  const token = await requireToken()
  const res = await fetch(`${API_BASE}/article-3d/jobs/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwIfNotOk(res)
  return res.json()
}

export async function getArticle3dModel(id) {
  if (MOCK) {
    const res = await fetch(SAMPLE_GLB)
    await throwIfNotOk(res)
    return res.blob()
  }

  const token = await requireToken()
  const res = await fetch(`${API_BASE}/article-3d/jobs/${id}/model`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  await throwIfNotOk(res)
  return res.blob()
}
