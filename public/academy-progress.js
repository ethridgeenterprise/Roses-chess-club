let clientPromise;

function getClient() {
    if (!clientPromise) {
        clientPromise = import(
            'https://esm.sh/@supabase/supabase-js@2'
        ).then(({createClient}) => createClient(
            'https://blvwmyhxomhjbksnrqzy.supabase.co',
            'sb_publishable_oG0HIPDTRKBBYVvDuTICJA_NTf9FSY5'
        )).catch(error => {
            clientPromise = null;
            throw error;
        });
    }

    return clientPromise;
}

export async function recordAcademyProgress(
    category, challengeId
) {
    try {
        const client = await getClient();

        const {data, error: authError} =
            await client.auth.getUser();

        if (authError || !data.user) return false;

        const {error} = await client
            .from('academy_progress')
            .insert({
                user_id: data.user.id,
                category,
                challenge_id: challengeId
            });

        if (error && error.code !== '23505') {
            throw error;
        }

        return true;

    } catch (error) {
        console.error('Academy progress save failed:', error);
        return false;
    }
}

export function puzzleId(puzzle) {
    return puzzle.fen + ':' +
        puzzle.from + puzzle.to;
}

export async function getDailyProgress(userId, day) {
    const client = await getClient();

    const {data: auth, error: authError} =
        await client.auth.getUser();

    if (authError || auth.user?.id !== userId) {
        throw new Error('Member session unavailable.');
    }

    const {data, error} = await client
        .from('academy_progress')
        .select('challenge_id')
        .eq('user_id', userId)
        .eq('category', 'daily')
        .like('challenge_id', day + ':%');

    if (error) throw error;

    return new Set(
        (data || []).map(row => row.challenge_id)
    );
}
