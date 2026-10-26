import asyncio
import json
import websockets

async def test_filler_and_duplicate_rejection():
    uri = "ws://localhost:8000/ws/interview"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"type": "start"}))
        await ws.recv() # listening

        # 1. Trigger filler: "okay, okay, okay" (force=False)
        print("Sending filler 'okay, okay, okay'...")
        await ws.send(json.dumps({
            "type": "trigger_question",
            "question": "okay, okay, okay",
            "force": False
        }))

        # Wait briefly to confirm NO question_detected event is emitted
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=1.5)
            data = json.loads(msg)
            assert data["type"] != "question_detected", f"Filler should not trigger question: {data}"
        except asyncio.TimeoutError:
            print("Confirmed: Filler 'okay, okay, okay' was correctly ignored!")

        # 2. Trigger conversational non-question: "So, we're going to go ahead and do this."
        print("Sending non-question transition...")
        await ws.send(json.dumps({
            "type": "trigger_question",
            "question": "So, we're going to go ahead and do this.",
            "force": False
        }))
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=1.5)
            data = json.loads(msg)
            assert data["type"] != "question_detected", f"Statement should not trigger question: {data}"
        except asyncio.TimeoutError:
            print("Confirmed: Non-question statement was correctly ignored!")

        # 3. Trigger legitimate question
        print("Sending real interview question...")
        q = "How does Redux Toolkit simplify state management?"
        await ws.send(json.dumps({
            "type": "trigger_question",
            "question": q,
            "force": False
        }))
        detected = False
        while True:
            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(msg)
            if data.get("type") == "question_detected":
                detected = True
            if data.get("type") == "answer_complete":
                break
        assert detected, "Real question should trigger answer!"
        print("Confirmed: Real question triggered answer successfully!")

        # 4. Immediate duplicate question should be ignored
        print("Sending duplicate question immediately...")
        await ws.send(json.dumps({
            "type": "trigger_question",
            "question": q,
            "force": False
        }))
        try:
            # Drain any listening status
            msg = await asyncio.wait_for(ws.recv(), timeout=1.5)
            data = json.loads(msg)
            assert data["type"] != "question_detected", f"Duplicate question should be ignored: {data}"
        except asyncio.TimeoutError:
            print("Confirmed: Duplicate question was correctly ignored!")

        await ws.send(json.dumps({"type": "stop"}))
        print("\nALL FILLER & DUPLICATE REJECTION TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(test_filler_and_duplicate_rejection())
