// Service.ts

export class PublisherService {
    private url: string;

    constructor(topic: string) {
        this.url = `https://http-harbor-eidos-production-80.schnworks.com/publish/${topic}`;
    }

    public async publish(payload: any): Promise<void> {
        try {
            const response = await fetch(this.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Request failed with status ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log('Publish successful:', data);
        } catch (error) {
            console.error('Error publishing to topic:', error);
        }
    }
}
