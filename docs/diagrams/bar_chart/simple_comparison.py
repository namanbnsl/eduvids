# DIAGRAM_SCHEMA: bar_chart_v1
# DESCRIPTION: Simple bar chart comparing values
# TOPICS: statistics, data, comparison

# Create a bar chart comparing different values
chart = create_bar_chart(
    values=[45, 72, 58, 31, 89],
    labels=["A", "B", "C", "D", "E"],
    colors=[BLUE, GREEN, YELLOW, ORANGE, PURPLE],
    bar_width=0.7,
    show_values=True,
)

# Animate the chart
self.play(FadeIn(chart, shift=UP * 0.3), run_time=1.5)
self.wait(0.5)
