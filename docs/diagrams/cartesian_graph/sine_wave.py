# DIAGRAM_SCHEMA: cartesian_graph_v1
# DESCRIPTION: Sine wave function
# TOPICS: trigonometry, sine, wave, periodic

# Create a sine wave graph
graph = create_cartesian_graph(
    func=lambda x: np.sin(x),
    x_range=(-2 * PI, 2 * PI, PI / 2),
    y_range=(-1.5, 1.5, 0.5),
    color=CYAN,
    show_labels=True,
    x_label="x",
    y_label="sin(x)",
    x_length=6,
    y_length=3,
)

# Animate the graph
self.play(Create(graph), run_time=2.0)
self.wait(0.5)
