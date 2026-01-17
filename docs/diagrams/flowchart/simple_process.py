# DIAGRAM_SCHEMA: flowchart_v1
# DESCRIPTION: Simple three-step process flow
# TOPICS: process, algorithm, steps

# Create a simple vertical flowchart
flowchart = create_flowchart(
    steps=[
        {"text": "Start", "type": "start"},
        {"text": "Process Data", "type": "process"},
        {"text": "Output", "type": "process"},
        {"text": "End", "type": "end"},
    ],
    connections=[
        [0, 1],
        [1, 2],
        [2, 3],
    ],
    direction="vertical",
    box_width=2.5,
    box_height=0.8,
)

# Animate the flowchart
self.play(FadeIn(flowchart, shift=UP * 0.3), run_time=1.5)
self.wait(0.5)
