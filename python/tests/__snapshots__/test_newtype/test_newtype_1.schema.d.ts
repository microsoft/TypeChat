// Entry point is: 'Profile'

interface Profile {
    user_id: string;
    count: number;
    admin_id: string;
    tags: string[];
    scores: Record<string, number>;
    optional_id: string | null;
    maybe_count?: number;
}
