# DIAGRAM_SCHEMA: flowchart_v1
# DESCRIPTION: Process with decision point
# TOPICS: decision, branching, conditional

# Create a flowchart with a decision point
flowchart = create_flowchart(
    steps=[
        {"text": "Start", "type": "start"},
        {"text": "Check Input", "type": "process"},
        {"text": "Valid?", "type": "decision"},
        {"text": "Process", "type": "process"},
        {"text": "End", "type": "end"},
    ],
    connections=[
        [0, 1],
        [1, 2],
        [2, 3, "Yes"],
        [3, 4],
    ],
    direction="vertical",
    box_width=2.2,
    box_height=0.7,
)

# Animate the flowchart
self.play(FadeIn(flowchart), run_time=1.5)
self.wait(0.5)
