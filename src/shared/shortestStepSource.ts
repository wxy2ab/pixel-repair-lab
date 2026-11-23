export const SHORTEST_STEP_SOURCE = `def shortest_step(board, start, goal):
    if start == goal:
        return None
    width = len(board[0])
    height = len(board)
    queue = [[start[0], start[1], None]]
    seen = {start[1] * width + start[0]: True}
    while len(queue) > 0:
        cell = queue.pop(0)
        for direction in ["up", "right", "down", "left"]:
            x = cell[0]
            y = cell[1]
            if direction == "up":
                y -= 1
            elif direction == "right":
                x += 1
            elif direction == "down":
                y += 1
            else:
                x -= 1
            if x < 0 or x >= width or y < 0 or y >= height:
                continue
            if board[y][x] == "#":
                continue
            key = y * width + x
            if key in seen:
                continue
            first = cell[2]
            if first is None:
                first = direction
            if [x, y] == goal:
                return first
            seen[key] = True
            queue.append([x, y, first])
    return None`
