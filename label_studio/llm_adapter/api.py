"""API views for LLM Adapter endpoints."""

import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


class EchoAPIView(APIView):
    """Echo endpoint for testing LLMTextArea integration.

    This endpoint accepts a prompt and echoes it back as LLM responses.
    Useful for development and testing without requiring actual LLM API calls.

    Request body:
        {
            "prompt": "string (required)",
            "num_responses": 1 (integer, optional, default=1, max=5),
            "task_id": "string (optional)",
            "annotation_id": "string (optional)"
        }

    Response body:
        {
            "responses": [
                {
                    "text": "string",
                    "metadata": {
                        "model": "echo-dev",
                        "tokens": integer
                    }
                }
            ]
        }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Handle POST request to echo the prompt."""
        try:
            # Extract required fields
            prompt = request.data.get('prompt')
            if not prompt:
                return Response(
                    {'error': 'Missing required field: prompt'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Extract optional fields
            num_responses = request.data.get('num_responses', 1)
            task_id = request.data.get('task_id')
            annotation_id = request.data.get('annotation_id')

            # Validate num_responses
            try:
                num_responses = int(num_responses)
                if num_responses < 1 or num_responses > 5:
                    num_responses = 1
            except (ValueError, TypeError):
                num_responses = 1

            # Calculate token count (simple word-based approximation)
            token_count = len(prompt.split())

            # Log the request
            logger.info(
                f"LLM Echo request - Task: {task_id}, Annotation: {annotation_id}, "
                f"Prompt length: {len(prompt)}, Num responses: {num_responses}"
            )

            # Generate responses (echo the prompt)
            responses = []
            for i in range(num_responses):
                response_text = f"Echo response #{i + 1}: {prompt}" if num_responses > 1 else prompt
                responses.append({
                    'text': response_text,
                    'metadata': {
                        'model': 'echo-dev',
                        'tokens': token_count,
                        'response_number': i + 1,
                    }
                })

            return Response({'responses': responses}, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error("Error in LLM Echo endpoint: %s", str(e), exc_info=True)
            return Response(
                {'error': 'Internal server error'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
