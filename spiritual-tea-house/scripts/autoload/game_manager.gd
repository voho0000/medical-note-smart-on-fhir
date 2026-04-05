extends Node
## 遊戲全局管理器
## 管理遊戲狀態、存檔、場景切換

enum GameState { TEAHOUSE, BATTLE, DIALOGUE, MENU }

var current_state: GameState = GameState.TEAHOUSE
var teahouse_level: int = 1  # 茶館成長階段 (1-5)
var player_data: Dictionary = {}

func _ready() -> void:
	print("[GameManager] 靈界茶館啟動")
	_init_player_data()

func _init_player_data() -> void:
	player_data = {
		"name": "繼承者",
		"party": [],        # 當前隊伍 (最多3人)
		"characters": [],   # 所有已獲得角色
		"inventory": {},    # 道具/材料
		"spirit_stones": 0, # 靈石 (抽卡貨幣)
		"story_progress": 0,
	}

func change_state(new_state: GameState) -> void:
	current_state = new_state

func save_game() -> void:
	var save_file = FileAccess.open("user://save_data.json", FileAccess.WRITE)
	if save_file:
		save_file.store_string(JSON.stringify(player_data))
		save_file.close()

func load_game() -> bool:
	if not FileAccess.file_exists("user://save_data.json"):
		return false
	var save_file = FileAccess.open("user://save_data.json", FileAccess.READ)
	if save_file:
		var data = JSON.parse_string(save_file.get_as_text())
		if data:
			player_data = data
			return true
	return false
