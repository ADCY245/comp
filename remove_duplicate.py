with open('app.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Split the content into lines
lines = content.splitlines(keepends=True)

# Find the start and end of the first occurrence
first_start = None
first_end = None
for i, line in enumerate(lines):
    if line.strip().startswith('@app.route(\'/admin/manage-users\')'):
        if first_start is None:
            first_start = i
        else:
            # This is the second occurrence
            first_end = i - 1
            break

# Find the end of the first function
if first_start is not None:
    for i in range(first_start, len(lines)):
        if lines[i].strip() == '':
            first_end = i
            break

# Remove the first occurrence
if first_start is not None and first_end is not None:
    new_lines = lines[:first_start] + lines[first_end + 1:]
    with open('app.py', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("Successfully removed duplicate route")
else:
    print("Could not find duplicate route to remove")
