export function serializeQuery(
    query: SpotifyApi.SearchForItemParameterObject
): string {
    let result = '?';

    for (const key in query) {
        switch (key) {
            case 'q':
                result += `q=${encodeURIComponent(query.q)}`;
                break;
            case 'type':
                result += `&type=${encodeURIComponent(query.type)}`;
                break;
            case 'include_external':
                result += `&internal_external=${query.include_external}`;
                break;
            case 'limit':
                result += `&limit=${query.limit}`;
                break;
            case 'market':
                result += `&market=${query.market}`;
                break;
            case 'offset':
                result += `&offset=${query.offset}`;
                break;
            default:
                break;
        }
    }

    return result;
}
