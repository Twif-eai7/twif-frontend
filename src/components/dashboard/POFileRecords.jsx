import { useEffect, useState } from 'react';
import { usePOFileRecords, getFileUrl } from '../../hooks/usePoFileRecords';

// ── Icons ─────────────────────────────────────────────────────────────────────

function FolderIcon({ open = false, size = 'md' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-5 h-5' };
  return (
    <svg
      className={`${sizes[size]} flex-shrink-0 transition-colors duration-150 ${open ? 'text-blue-400' : 'text-slate-400'}`}
      viewBox="0 0 24 24"
      fill={open ? 'rgba(96,165,250,0.15)' : 'none'}
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-3.5 h-3.5 flex-shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
      viewBox="0 0 20 20" fill="none"
    >
      <path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM18 18l-4-4"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function FileDocIcon({ ext }) {
  const colors = {
    PDF: 'text-red-400', XLSX: 'text-green-500', XLS: 'text-green-500',
    DOC: 'text-blue-400', DOCX: 'text-blue-400',
  };
  return (
    <svg className={`w-8 h-8 flex-shrink-0 ${colors[ext] || 'text-slate-400'}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function SpinnerIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileItem({ filePath, fileName, onDownload,bucket}) {
  const [dlState, setDlState] = useState('idle');
  const url = getFileUrl(filePath,bucket);
  const ext = fileName.split('.').pop().toUpperCase();

  const extBadge = {
    PDF:  'bg-red-50 text-red-600 border-red-100',
    XLSX: 'bg-green-50 text-green-700 border-green-100',
    XLS:  'bg-green-50 text-green-700 border-green-100',
    DOC:  'bg-blue-50 text-blue-600 border-blue-100',
    DOCX: 'bg-blue-50 text-blue-600 border-blue-100',
  };

  const handleDownload = async () => {
    setDlState('downloading');
    try {
      await onDownload(url, fileName);
      setDlState('idle');
    } catch {
      setDlState('error');
      setTimeout(() => setDlState('idle'), 3000);
    }
  };

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 rounded-xl
      bg-white border border-slate-100 hover:border-blue-200 hover:shadow-sm
      transition-all duration-150 mb-2">
      <FileDocIcon ext={ext} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate leading-tight">{fileName}</p>
        <span className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded border tracking-wide ${extBadge[ext] || 'bg-slate-50 text-slate-500 border-slate-100'}`}>
          {ext}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 sm:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <a href={url} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
            bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors duration-150 no-underline">
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M8 3C4.5 3 1.7 5.6 1 8c.7 2.4 3.5 5 7 5s6.3-2.6 7-5c-.7-2.4-3.5-5-7-5z"
              stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className="hidden sm:inline">View</span>
        </a>
        <button type="button" onClick={handleDownload} disabled={dlState === 'downloading'}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
            bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed
            transition-colors duration-150">
          {dlState === 'downloading' ? (
            <><SpinnerIcon className="w-3.5 h-3.5" /><span className="hidden sm:inline">Saving…</span></>
          ) : dlState === 'error' ? (
            <><span>⚠</span><span className="hidden sm:inline">Retry</span></>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M8 1v10M4 7l4 4 4-4M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="hidden sm:inline">Download</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function SkeletonRows({ count = 2 }) {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-slate-100 animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-slate-100 rounded-full w-2/5" />
            <div className="h-2 bg-slate-50 rounded-full w-1/6" />
          </div>
          <div className="w-16 h-6 bg-slate-100 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ── Reusable tree toggle row ──────────────────────────────────────────────────

function TreeRow({ open, onClick, depth = 0, label, icon}) {
  const depths = ['', 'pl-3', 'pl-6'];
  return (
    <button type="button" onClick={onClick}
      className={`w-full flex items-center gap-2 py-2 px-2 rounded-lg text-left
        hover:bg-white/70 transition-colors duration-100 ${depths[depth] || ''}`}>
      <ChevronIcon open={open} />
      {icon}
      <span className={`flex-1 text-sm font-semibold truncate transition-colors ${open ? 'text-slate-800' : 'text-slate-500'}`}>
        {label}
      </span> 
    </button>
  );
}

// ── Nested folder ─────────────────────────────────────────────────────────────

function NestedFolder({ name, path, hook }) {
  const { expanded, toggleNested, getItems, bucket, downloadFile } = hook;
  const isOpen = !!expanded[path];
  const items = getItems(path);
  const files = isOpen && items ? items.filter(i => i.id !== null) : [];
  const subFolders = isOpen && items ? items.filter(i => i.id === null) : [];

  return (
    <div>
      <TreeRow open={isOpen} onClick={() => toggleNested(path)} depth={2}
        icon={<FolderIcon open={isOpen} size="sm" />} label={name}
        badge={items ? items.filter(i => i.id !== null).length : '…'}
        badgeVariant="slate" />
      {isOpen && (
        <div className="ml-5 border-l border-slate-100 pl-2 mt-0.5">
          {!items && <SkeletonRows count={1} />}
          {subFolders.map(sub => (
            <NestedFolder key={sub.name} name={sub.name} path={`${path}/${sub.name}`} hook={hook} />
          ))}
          {files.map(file => (
            <FileItem key={file.name} filePath={`${path}/${file.name}`}
              fileName={file.name} onDownload={downloadFile} bucket={bucket} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Date folder ───────────────────────────────────────────────────────────────

function DateFolder({ name, path, hook }) {
  const { expanded, toggleFolder, getItems, bucket, downloadFile } = hook;
  const isOpen = !!expanded[path];
  const items = getItems(path);
  const files = isOpen && items ? items.filter(i => i.id !== null) : [];
  const subFolders = isOpen && items ? items.filter(i => i.id === null) : [];
  const count = items ? items.filter(i => i.id !== null).length : '…';

  return (
    <div>
      <TreeRow open={isOpen} onClick={() => toggleFolder(path)} depth={1}
        icon={<FolderIcon open={isOpen} size="sm" />} label={name}
        badge={count} badgeVariant="indigo" />
      {isOpen && (
        <div className="ml-4 border-l border-slate-100 pl-2 mt-0.5">
          {!items && <SkeletonRows count={2} />}
          {subFolders.map(sub => (
            <NestedFolder key={sub.name} name={sub.name}
              path={`${path}/${sub.name}`} hook={hook} />
          ))}
          {files.map(file => (
            <FileItem key={file.name} filePath={`${path}/${file.name}`}
              fileName={file.name} onDownload={downloadFile} bucket={bucket} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Month section ─────────────────────────────────────────────────────────────

function MonthSection({ name, path, hook }) {
  const { expanded, toggleMonth, getItems } = hook;
  const isOpen = !!expanded[path];
  const items = getItems(path);
  const folders = isOpen && items ? items.filter(i => i.id === null) : [];

  return (
    <div>
      <TreeRow open={isOpen} onClick={() => toggleMonth(path)} depth={0}
        icon={<FolderIcon open={isOpen} size="md" />} label={name} />
      {isOpen && (
        <div className="ml-3 border-l border-slate-100 pl-2 mt-0.5 mb-1">
          {!items && <SkeletonRows count={3} />}
          {folders.map(folder => (
            <DateFolder key={folder.name} name={folder.name}
              path={`${path}/${folder.name}`} hook={hook} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Buyer card ────────────────────────────────────────────────────────────────

function BuyerCard({ buyer, hook, index }) {
  const { expanded, toggleBuyer, getItems } = hook;
  const { displayName, basePath } = buyer;
  const isOpen = !!expanded[basePath];
  const items = getItems(basePath) || [];
  const months = items.filter(i => i.id === null);

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 overflow-hidden
        shadow-sm hover:shadow-md transition-shadow duration-200"
      style={{ animationDelay: `${index * 55}ms`, animationFillMode: 'both' }}
    >
      {/* Buyer header button */}
      <button type="button" onClick={() => toggleBuyer(basePath)}
        className="w-full flex items-center gap-3.5 px-5 py-4 text-left hover:bg-slate-50/80 transition-colors duration-150">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
          transition-all duration-200 font-bold text-sm
          ${isOpen ? 'bg-blue-500 text-white shadow-md shadow-blue-200' : 'bg-slate-100 text-slate-500'}`}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate">{displayName}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {months.length} {months.length === 1 ? 'month' : 'months'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full transition-colors
            ${isOpen ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
            {months.length}
          </span>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center
            transition-all duration-200 ${isOpen ? 'bg-blue-100' : 'bg-slate-100'}`}>
            <svg
              className={`w-4 h-4 transition-all duration-200
                ${isOpen ? 'text-blue-600 rotate-180' : 'text-slate-400 rotate-0'}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expandable content */}
      {isOpen && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
          {months.length === 0
            ? <p className="text-xs text-slate-400 py-4 text-center">No months available</p>
            : months.map(month => (
                <MonthSection key={month.name} name={month.name}
                  path={`${basePath}/${month.name}`} hook={hook} />
              ))
          }
        </div>
      )}
    </div>
  );
}

const allowedBuckets = [{year: 'FY 2027', value: 'POFY27'}, {year: 'FY 2026', value: 'POFY26'}, {year: 'FY 2025', value: 'documents'}];

// ── Main export ───────────────────────────────────────────────────────────────

export default function POFileRecords() {
  const [bucket, setBucket] = useState(allowedBuckets[0].value);
  const [query, setQuery] = useState('');
  const hook = usePOFileRecords(bucket);
  const { buyers, loading, error, init } = hook;

  useEffect(() => { init(); }, [init]);

  const filtered = query
    ? buyers.filter(b => b.displayName.toLowerCase().includes(query.toLowerCase()))
    : buyers;

  return (
    <div className="p-4 pt-8">
      <div className="w-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-200">
              <svg className="w-4.5 h-4.5 text-white" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">
                {allowedBuckets.find(b => b.value === bucket)?.year} Purchase Orders
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Browse and download your PO documents
              </p>
            </div>
            <div>
              <select value={bucket} onChange={e => setBucket(e.target.value)}
                className="ml-4 px-2 py-1 rounded-md border border-slate-200 text-sm text-slate-700
                  focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent
                  transition-colors duration-150">
                {allowedBuckets.map(b => (
                  <option key={b.value} value={b.value}>{b.year}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search buyers…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-white
              text-sm text-slate-800 placeholder-slate-400 shadow-sm
              focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent
              transition-all duration-150"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full
                bg-slate-200 flex items-center justify-center hover:bg-slate-300 transition-colors">
              <svg className="w-3 h-3 text-slate-500" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <SpinnerIcon className="w-8 h-8 text-blue-400" />
            <p className="text-sm text-slate-400">Loading documents…</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Failed to load</p>
              <p className="text-xs text-slate-400 mt-1">{error}</p>
            </div>
            <button onClick={init}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100
                text-slate-600 hover:bg-slate-200 transition-colors">
              Try again
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && buyers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-2">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-300" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.75">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-sm text-slate-400">No documents found</p>
          </div>
        )}

        {/* Buyer list */}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {query && (
              <p className="text-xs text-slate-400 pb-1">
                {filtered.length} {filtered.length === 1 ? 'result' : 'results'} for "{query}"
              </p>
            )}
            {filtered.map((buyer, i) => (
              <BuyerCard key={buyer.basePath} buyer={buyer} hook={hook} index={i} />
            ))}
          </div>
        )}

        {/* No search match */}
        {!loading && !error && buyers.length > 0 && filtered.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-12">
            No buyers match "<span className="text-slate-600 font-medium">{query}</span>"
          </p>
        )}

      </div>
    </div>
  );
}