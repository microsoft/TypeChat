import * as chat from '../../src/lib/agent';

test('Chat: EventHistory', () => {
    const history = new chat.EventHistory<chat.ChatMessage>();
    const numMessages = 50;
    for (let i = 0; i < numMessages; ++i) {
        const sourceType =
            i % 2 === 0 ? chat.SourceType.User : chat.SourceType.AI;
        history.append({
            text: 'Message: ' + i.toString(),
            source: {
                type: sourceType,
                name: sourceType.toString(),
            },
        });
    }
    expect(history.length).toEqual(numMessages);
    let iMsg = numMessages - 1;
    for (const msg of history.allEvents()) {
        expect(msg.data.text).toEqual(history.get(iMsg).data.text);
        --iMsg;
    }
});
