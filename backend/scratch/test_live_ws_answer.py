import asyncio
import json
import websockets

async def test_live_interview_session():
    uri = "ws://localhost:8000/ws/interview"
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        # 1. Start interview session
        print("Sending 'start' event...")
        await ws.send(json.dumps({
            "type": "start",
            "resume": "Senior Full-Stack Engineer with React, TypeScript, and Python expertise.",
            "jobDescription": "Build real-time AI interview assistants with low latency.",
            "answerMode": "concise"
        }))

        # Wait for listening status
        status_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
        print(f"Received initial status: {status_msg}")
        assert status_msg["type"] == "status"
        assert status_msg["status"] == "listening"

        # 2. Trigger question: "How does Redux Toolkit simplify state management?"
        question = "How does Redux Toolkit simplify state management?"
        print(f"Triggering question: '{question}'...")
        await ws.send(json.dumps({
            "type": "trigger_question",
            "question": question
        }))

        received_events = []
        answer_chunks = []
        complete_event = None

        while True:
            msg_raw = await asyncio.wait_for(ws.recv(), timeout=10.0)
            data = json.loads(msg_raw)
            event_type = data.get("type")
            received_events.append(event_type)

            if event_type == "answer_chunk":
                answer_chunks.append(data.get("delta", ""))
            elif event_type == "answer_complete":
                complete_event = data
                print(f"\n--- Answer Complete Event Received! ---")
                print(f"TTFT: {data['metrics']['ttft_ms']} ms")
                print(f"Total: {data['metrics']['total_ms']} ms")
                print(f"Tokens: {data['metrics']['token_count']}")
                break

        print(f"\nEvents sequence: {set(received_events)}")
        full_text = "".join(answer_chunks)
        print(f"\nFull Streamed Answer:\n{full_text}")

        assert "question_detected" in received_events
        assert len(answer_chunks) > 0
        assert complete_event is not None
        assert complete_event["metrics"]["ttft_ms"] < 3000

        # 3. Stop session
        await ws.send(json.dumps({"type": "stop"}))
        while True:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
            if msg.get("type") == "status" and msg.get("status") == "stopped":
                print(f"Stopped status confirmed: {msg}")
                break

        print("\n>>> LIVE WEBSOCKET QUESTION & ANSWER TEST PASSED 100%! <<<")

if __name__ == "__main__":
    asyncio.run(test_live_interview_session())
