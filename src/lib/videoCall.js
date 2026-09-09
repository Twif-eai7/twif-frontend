function firstUrl(...candidates) {
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
    data.joinUrl, data.hostJoinUrl, data.embedJoinUrl, data.guestJoinUrl, notification.joinUrl,
    invite.hostJoinUrl, invite.embedJoinUrl, invite.guestJoinUrl, invite.joinUrl, invite.notification?.joinUrl,
  ]
  const guestFirst = [
    data.joinUrl, data.guestJoinUrl, notification.joinUrl, data.embedJoinUrl, data.hostJoinUrl,
    invite.guestJoinUrl, invite.notification?.joinUrl, invite.embedJoinUrl, invite.hostJoinUrl, invite.joinUrl,
  ]
  return firstUrl(...(role === 'host' ? hostFirst : guestFirst))
}

export function toEmbedJoinUrl(joinUrl, displayName) {
  if (!joinUrl) return joinUrl
  const name = displayName ? String(displayName).trim().slice(0, 80) : ''
  try {
    const url = new URL(joinUrl)
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
