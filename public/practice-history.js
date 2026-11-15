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

export async function getPracticeOwner() {
    try {
        const client = await getClient();
        const {data, error} = await client.auth.getUser();
        return error ? null : data.user?.id || null;
    } catch {
        return null;
    }
}

export async function savePracticeGame(record, owner) {
    if (!owner) return false;

    const client = await getClient();

    const {data, error: authError} =
        await client.auth.getUser();

    if (authError || data.user?.id !== owner) {
        return false;
    }

    const {error} = await client
        .from('practice_games')
        .insert({
            ...record,
            user_id: owner
        });

    if (error && error.code !== '23505') {
        throw error;
    }

    return true;
}
