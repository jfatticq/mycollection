import { json } from '@/lib/auth/access';
export async function GET() { return json({ error: 'Market estimates are not available yet.' }, 501); }
