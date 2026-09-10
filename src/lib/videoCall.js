function hasRoomId(joinUrl) {
  if (typeof joinUrl !== 'string' || !joinUrl.trim()) return false
  try {
    return Boolean(new URL(joinUrl).searchParams.get('roomId'))
  } catch {
    return /[?&]roomId=/.test(joinUrl)
  }
}

function firstUrl(...candidates) {
  const withRoom = candidates.find((value) => hasRoomId(value))
  if (withRoom) return withRoom.trim()
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export function pickJoinUrl(data, role) {
  if (!data || typeof data !== 'object') return null
  const invite = data.invite && typeof data.invite === 'object' ? data.invite : {}
  const notification = data.notification || invite.notification || {}
  const hostFirst = [
    data.joinUrl, data.hostJoinUrl, data.guestJoinUrl, notification.joinUrl, data.embedJoinUrl,
    invite.hostJoinUrl, invite.guestJoinUrl, invite.joinUrl, invite.notification?.joinUrl, invite.embedJoinUrl,
  ]
  const guestFirst = [
    data.joinUrl, data.guestJoinUrl, notification.joinUrl, data.hostJoinUrl, data.embedJoinUrl,
    invite.guestJoinUrl, invite.notification?.joinUrl, invite.hostJoinUrl, invite.joinUrl, invite.embedJoinUrl,
  ]
  return firstUrl(...(role === 'host' ? hostFirst : guestFirst))
}

export function toEmbedJoinUrl(joinUrl, displayName) {
  if (!joinUrl) return joinUrl
  const name = displayName ? String(displayName).trim().slice(0, 80) : ''
  try {
    const url = new URL(joinUrl)
    if (url.pathname.endsWith('/embed.html') || url.pathname === '/embed.html') {
      url.pathname = url.pathname.replace(/embed\.html$/, 'room.html')
    }
    url.searchParams.set('embed', '1')
    if (name && !url.searchParams.get('name')) url.searchParams.set('name', name)
    return url.toString()
  } catch {
    const sep = joinUrl.includes('?') ? '&' : '?'
    const bits = ['embed=1']
    if (name && !/[?&]name=/.test(joinUrl)) bits.push(`name=${encodeURIComponent(name)}`)
    return `${joinUrl}${sep}${bits.join('&')}`
  }
}
