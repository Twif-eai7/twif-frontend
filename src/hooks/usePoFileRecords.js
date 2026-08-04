import { useState, useCallback, useRef } from 'react';
import { useProfileStore } from '../stores/profileStore';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const BUCKET = 'POFY27';
const BASE = import.meta.env.VITE_BACKEND_URL;


export function getFileUrl(path,bucket) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

async function fetchList(memberId, path = '', level = 'root',bucket) {
  const endpoints = {
    root:   `${BASE}/pofiles?memberId=${memberId}&bucket=${bucket}`,
    month:  `${BASE}/pofiles/month?memberId=${memberId}&bucket=${bucket}&path=${encodeURIComponent(path)}`,
    folder: `${BASE}/pofiles/folder?memberId=${memberId}&bucket=${bucket}&path=${encodeURIComponent(path)}`,
  };

  const res = await fetch(endpoints[level]);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const json = await res.json();
  return json.items || [];
}

export function usePOFileRecords(bucket) {
  const memberId = useProfileStore(s => s.orgMembership?.memberId);

  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // cache: { [path]: items[] }
  const cache = useRef({});
  // expanded: { [path]: boolean }
  const [expanded, setExpanded] = useState({});
  // folderContents: { [path]: items[] } — drives re-renders when lazy-loaded
  const [folderContents, setFolderContents] = useState({});

  // ── Initial load ──────────────────────────────────────────────
  const init = useCallback(async () => {
    if (!memberId) return;
    // Reset all state for new bucket
    cache.current = {};
    setExpanded({});
    setFolderContents({});
    setBuyers([]);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${BASE}/pofiles?memberId=${memberId}&bucket=${bucket}`
      );
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = await res.json();
      const rawBuyers = json.buyers || [];

      rawBuyers.forEach(({ basePath, items }) => {
        cache.current[basePath] = items;
      });

      setBuyers(rawBuyers);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [memberId, bucket]);

  // ── Generic lazy-load helper ──────────────────────────────────
  const ensureLoaded = useCallback(async (path, level) => {
    if (cache.current[path]) return cache.current[path];

    const items = await fetchList(memberId, path, level, bucket);
    cache.current[path] = items;

    setFolderContents(prev => ({ ...prev, [path]: items }));
    return items;
  }, [memberId, bucket]);

  // ── Toggle helpers ─────────────────────────────────────────────
  const toggle = useCallback(async (path, level) => {
    const isOpen = expanded[path];

    if (isOpen) {
      setExpanded(prev => ({ ...prev, [path]: false }));
      return;
    }

    // Pre-fetch if needed before opening
    if (!cache.current[path] && level !== 'buyer') {
      try {
        await ensureLoaded(path, level);
      } catch (err) {
        console.error('Failed to load', path, err);
        return;
      }
    }

    setExpanded(prev => ({ ...prev, [path]: true }));

    // For folders with sub-folders: eagerly prefetch nested counts
    if (level === 'folder') {
      const items = cache.current[path] || [];
      const subFolders = items.filter(i => i.id === null);
      await Promise.all(
        subFolders.map(async (sub) => {
          const subPath = `${path}/${sub.name}`;
          if (!cache.current[subPath]) {
            const subItems = await fetchList(memberId, subPath, 'folder');
            cache.current[subPath] = subItems;
            setFolderContents(prev => ({ ...prev, [subPath]: subItems }));
          }
        })
      );
    }
  }, [memberId, expanded, ensureLoaded]);

  const toggleBuyer  = (path) => toggle(path, 'buyer');
  const toggleMonth  = (path) => toggle(path, 'month');
  const toggleFolder = (path) => toggle(path, 'folder');
  const toggleNested = (path) => toggle(path, 'folder');

  // ── Getters ────────────────────────────────────────────────────
  const getItems = (path) =>
    // folderContents drives re-renders; cache is the source of truth
    folderContents[path] ?? cache.current[path] ?? null;

  // ── Download ───────────────────────────────────────────────────
  const downloadFile = useCallback(async (url, filename, onProgress) => {
    onProgress?.('downloading');
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(link);
      onProgress?.('done');
    } catch (err) {
      onProgress?.('error');
      throw err;
    }
  }, []);

  return {
    bucket,
    buyers,
    loading,
    error,
    expanded,
    init,
    getItems,
    toggleBuyer,
    toggleMonth,
    toggleFolder,
    toggleNested,
    downloadFile,
  };
}