import { useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { uploadToTerBucket } from '../lib/terStorage';
import { useProfileStore } from '../stores/profileStore';

const PAGE_SIZE = 10;
const TABLE = 'tech_enhancement_requests';
const VOTES_TABLE = 'tech_enhancement_request_votes';

// ── Direct Supabase data functions ──────────────────────────

export async function fetchAllRequests() {
  return supabase.from(TABLE)
    .select('*, organization_members(full_name, department)')
    .order('created_at', { ascending: false });
}

export async function createRequest({ title, description, priority, file, memberId }) {
  const attachmentPath = file ? await uploadToTerBucket(file, memberId) : null;
  return supabase.from(TABLE)
    .insert([{
      organization_member_id: memberId,
      title,
      description,
      priority,
      attachment_url: attachmentPath,
      status: 'submitted',
    }])
    .select()
    .single();
}

export async function updateRequestStatus(id, { status, priority, resolutionComment }) {
  const patch = { updated_at: new Date().toISOString() };
  if (status !== undefined) patch.status = status;
  if (priority !== undefined) patch.priority = priority;
  if (resolutionComment !== undefined) patch.resolution_comment = resolutionComment;

  return supabase.from(TABLE).update(patch).eq('id', id).select().single();
}

export async function fetchVotesForRequests(requestIds) {
  if (!requestIds.length) return { data: [], error: null };
  return supabase.from(VOTES_TABLE)
    .select('request_id, organization_member_id')
    .in('request_id', requestIds);
}

export async function addVote(requestId, memberId) {
  return supabase.from(VOTES_TABLE)
    .insert({ request_id: requestId, organization_member_id: memberId });
}

export async function removeVote(requestId, memberId) {
  return supabase.from(VOTES_TABLE)
    .delete().eq('request_id', requestId).eq('organization_member_id', memberId);
}

// ── Token numbers ────────────────────────────────────────────
// Derived purely from created_at + creation order, not stored in the DB -
// REQ<YYYYMMDD><seq>, seq a 3-digit, zero-padded, per-day counter starting
// at 001 for that day's first request (oldest first). Computed over the
// FULL request list (not just the current page) so a request's token stays
// stable across pagination and doesn't depend on which page it lands on.
function computeTokens(requests) {
  const byDate = new Map();
  const tokens = {};
  const sorted = [...requests].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const r of sorted) {
    const d = new Date(r.created_at);
    const dateKey = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const seq = (byDate.get(dateKey) || 0) + 1;
    byDate.set(dateKey, seq);
    tokens[r.id] = `REQ${dateKey}${String(seq).padStart(3, '0')}`;
  }
  return tokens;
}

// ── Hook: state, pagination, derived stats, voting ───────────

export function useTechEnhancementRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [voteCounts, setVoteCounts] = useState({});
  const [myVotedRequestIds, setMyVotedRequestIds] = useState(new Set());

  const memberId = useProfileStore(s => s.orgMembership?.memberId);

  const fetchVotes = useCallback(async (requestList) => {
    const { data: votes, error: votesError } = await fetchVotesForRequests(requestList.map(r => r.id));
    if (votesError) return;
    const counts = {};
    const mine = new Set();
    for (const v of (votes || [])) {
      counts[v.request_id] = (counts[v.request_id] || 0) + 1;
      if (v.organization_member_id === memberId) mine.add(v.request_id);
    }
    setVoteCounts(counts);
    setMyVotedRequestIds(mine);
  }, [memberId]);

  const fetchRequests = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await fetchAllRequests();
      if (fetchError) throw fetchError;
      setRequests(data || []);
      setCurrentPage(1);
      await fetchVotes(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [memberId, fetchVotes]);

  const submitRequest = useCallback(async ({ title, description, priority, file }) => {
    const { data, error: submitError } = await createRequest({ title, description, priority, file, memberId });
    if (submitError) throw new Error(submitError.message || 'Submission failed');
    // Seed the requester's own vote so a new request starts at 1, not 0 —
    // best-effort: a failed self-vote shouldn't surface as a failed submission.
    await addVote(data.id, memberId);
    await fetchRequests();
  }, [memberId, fetchRequests]);

  const updateStatus = useCallback(async (id, updates) => {
    const { error: updateError } = await updateRequestStatus(id, updates);
    if (updateError) throw new Error(updateError.message || 'Update failed');
    await fetchRequests();
  }, [fetchRequests]);

  const toggleVote = useCallback(async (id) => {
    const hasVoted = myVotedRequestIds.has(id);
    const { error: voteError } = hasVoted
      ? await removeVote(id, memberId)
      : await addVote(id, memberId);
    if (voteError) return;
    await fetchVotes(requests);
  }, [memberId, myVotedRequestIds, requests, fetchVotes]);

  // ── Derived stats ───────────────────────────────────────────
  const stats = {
    total: requests.length,
    submitted: requests.filter(r => r.status === 'submitted').length,
    inReview: requests.filter(r => r.status === 'in_review').length,
    inProgress: requests.filter(r => r.status === 'in_progress').length,
    done: requests.filter(r => r.status === 'done').length,
  };

  // ── Pagination ────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(requests.length / PAGE_SIZE));
  const pagedRequests = requests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const goNext = () => setCurrentPage(p => Math.min(p + 1, totalPages));
  const goPrev = () => setCurrentPage(p => Math.max(p - 1, 1));

  const tokenByRequestId = useMemo(() => computeTokens(requests), [requests]);

  return {
    requests,
    pagedRequests,
    loading,
    error,
    stats,
    currentPage,
    totalPages,
    goNext,
    goPrev,
    fetchRequests,
    submitRequest,
    updateStatus,
    voteCounts,
    myVotedRequestIds,
    tokenByRequestId,
    toggleVote,
  };
}
