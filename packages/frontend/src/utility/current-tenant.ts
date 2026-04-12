export function getCurrentTenantHost(): string {
	return window.location.host.replace(/:\d+$/, '').toLowerCase();
}

export function isHostCurrentTenant(host: string | null | undefined): boolean {
	if (host == null) return true;
	return host.toLowerCase() === getCurrentTenantHost();
}

export function isUserLocalToCurrentTenant(user: { host?: string | null; isLocal?: boolean | null }): boolean {
	if (typeof user.isLocal === 'boolean') return user.isLocal;
	return isHostCurrentTenant(user.host ?? null);
}
