# DIAGRAM_SCHEMA: code_block_v1
# DESCRIPTION: Python function example with syntax highlighting
# TOPICS: programming, python, function, cs

# Create a code block showing a Python function
code = create_code_block(
    code_str='''def fibonacci(n):
    """Calculate the nth Fibonacci number."""
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

# Example usage
result = fibonacci(10)
print(f"F(10) = {result}")''',
    language="python",
    style="monokai",
    font_size=18,
)

# Animate the code block
self.play(FadeIn(code, shift=UP * 0.3), run_time=1.5)
self.wait(0.5)
