import axios from 'axios';

export type ClientData = {
    clientId: string;
    clientSecret: string;
};

export type User = {
    username?: string;
    token: string;
    id?: string;
};

export class SpotifyService {
    private accessToken?: string;
    private clientId: string;
    private clientSecret: string;
    private loggedIn: boolean;
    private loggedInUser: User | null;

    constructor(clientData: ClientData) {
        this.clientId = clientData.clientId;
        this.clientSecret = clientData.clientSecret;
        this.loggedIn = false;
        this.loggedInUser = null;
    }

    storeToken(token: string): string {
        this.accessToken = token;
        return this.accessToken;
    }

    retrieveToken(): string {
        if (!this.accessToken) {
            throw new Error('SpotifyService: no accessToken');
        }
        return this.accessToken;
    }

    isLoggedIn(): boolean {
        return this.loggedIn;
    }

    retrieveUser(): User {
        if (this.loggedInUser === null) {
            throw new Error('SpotifyService: no loggedInUser');
        }
        return this.loggedInUser;
    }

    storeUser(user: User) {
        this.loggedInUser = user;
    }

    async init(): Promise<Object> {
        const authConfig = {
            headers: {
                Authorization: `Basic ${Buffer.from(
                    `${this.clientId}:${this.clientSecret}`
                ).toString('base64')}`,
            },
        };

        try {
            const authData = await axios.post(
                'https://accounts.spotify.com/api/token',
                'grant_type=client_credentials',
                authConfig
            );
            this.storeToken(authData.data.access_token);

            return authData.data;
        } catch (e) {
            // TODO: REVIEW: should we really be returing the response
            // data in an error condition?
            if (e instanceof axios.AxiosError) {
                // TODO: REVIEW: the type returned here may not be Promise<Object>
                return e.response?.data;
            } else {
                throw e;
            }
        }
    }
}
