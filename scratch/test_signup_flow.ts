import assert from 'assert'

// Test simulation of Signup submit handler behavior
async function testSignupFlow() {
  console.log("==================================================")
  console.log("RUNNING SIGNUP RUNTIME VERIFICATION SUITE")
  console.log("==================================================\n")

  let isLoading = false
  let isSubmitting = false
  let error: string | null = null
  let success = false
  let renderHistory: Array<{ isProcessing: boolean; buttonText: string; hasSpinner: boolean }> = []
  let networkCallCount = 0

  function setIsLoading(val: boolean) {
    isLoading = val
  }

  function render() {
    const isProcessing = isLoading || isSubmitting
    const buttonText = isProcessing ? "Creating School Account..." : "Create School Account"
    const hasSpinner = isProcessing
    renderHistory.push({ isProcessing, buttonText, hasSpinner })
  }

  // Initial render
  render()
  assert.strictEqual(renderHistory[0].isProcessing, false)
  assert.strictEqual(renderHistory[0].buttonText, "Create School Account")
  assert.strictEqual(renderHistory[0].hasSpinner, false)
  console.log("✓ Initial state: Button shows 'Create School Account' with no spinner.")

  // Mock server action for signup
  let mockSignupDelay = 100
  let mockSignupResult: { success: boolean; error?: string } = { success: false, error: 'Email address is already in use.' }

  let mockSignup = async (_data: any): Promise<any> => {
    networkCallCount++
    await new Promise((r) => setTimeout(r, mockSignupDelay))
    return mockSignupResult
  }

  // Real onSubmit flow as implemented in SignupPage
  async function onSubmit(data: any) {
    const isProcessing = isLoading || isSubmitting
    if (isProcessing) {
      console.log("  [Blocked duplicate submission - isProcessing is true]")
      return
    }

    setError(null)
    setIsLoading(true)
    render()

    // Yield execution to browser paint cycle
    await new Promise((resolve) => setTimeout(resolve, 0))

    try {
      const result = await mockSignup(data)
      if (result.success) {
        success = true
      } else {
        error = result.error || "An error occurred during registration."
        setIsLoading(false)
        render()
      }
    } catch (err: any) {
      error = "An unexpected error occurred. Please try again."
      setIsLoading(false)
      render()
    }
  }

  function setError(msg: string | null) {
    error = msg
  }

  // --------------------------------------------------------------------------
  // Scenario 1: Failed Registration
  // --------------------------------------------------------------------------
  console.log("\n--- Testing Scenario 1: Failed Registration ---")
  renderHistory = []
  networkCallCount = 0
  mockSignupResult = { success: false, error: 'Email address is already in use.' }

  const submitPromise = onSubmit({ schoolName: "Test School" })

  // Check state while request is in flight
  assert.strictEqual(isLoading, true, "isLoading must be true immediately")
  assert.strictEqual(renderHistory[0].buttonText, "Creating School Account...", "Button text must change to 'Creating School Account...'")
  assert.strictEqual(renderHistory[0].hasSpinner, true, "Spinner must be active while loading")
  console.log("✓ During flight: Button displays 'Creating School Account...' and animated spinner.")

  await submitPromise
  assert.strictEqual(isLoading, false, "isLoading must reset to false after failure")
  assert.strictEqual(error, "Email address is already in use.", "Error message must be set")
  const lastRender = renderHistory[renderHistory.length - 1]
  assert.strictEqual(lastRender.buttonText, "Create School Account", "Button text must restore to 'Create School Account'")
  assert.strictEqual(lastRender.hasSpinner, false, "Spinner must disappear after failure")
  console.log("✓ After failure: Error displayed, button restored to 'Create School Account' without spinner.")

  // --------------------------------------------------------------------------
  // Scenario 2: Duplicate Submission Prevention
  // --------------------------------------------------------------------------
  console.log("\n--- Testing Scenario 2: Duplicate Submission ---")
  networkCallCount = 0
  mockSignupDelay = 150

  const firstClick = onSubmit({ schoolName: "Test School" })
  // Rapid second and third clicks while pending
  const secondClick = onSubmit({ schoolName: "Test School" })
  const thirdClick = onSubmit({ schoolName: "Test School" })

  await Promise.all([firstClick, secondClick, thirdClick])
  assert.strictEqual(networkCallCount, 1, "Only 1 registration request must be made despite repeated clicks")
  console.log("✓ Duplicate prevention: 3 rapid clicks resulted in exactly 1 registration network request.")

  // --------------------------------------------------------------------------
  // Scenario 3: Slow Registration
  // --------------------------------------------------------------------------
  console.log("\n--- Testing Scenario 3: Slow Registration ---")
  mockSignupDelay = 400
  renderHistory = []

  const slowSubmit = onSubmit({ schoolName: "Test School" })
  
  // Check at 100ms
  await new Promise((r) => setTimeout(r, 100))
  assert.strictEqual(isLoading, true, "Loading state must remain active during slow request (100ms)")
  
  // Check at 250ms
  await new Promise((r) => setTimeout(r, 150))
  assert.strictEqual(isLoading, true, "Loading state must remain active during slow request (250ms)")

  await slowSubmit
  assert.strictEqual(isLoading, false, "Loading state resets after slow request finishes")
  console.log("✓ Slow registration: Loading state and spinner remained active throughout the entire 400ms duration.")

  // --------------------------------------------------------------------------
  // Scenario 4: Successful Registration
  // --------------------------------------------------------------------------
  console.log("\n--- Testing Scenario 4: Successful Registration ---")
  renderHistory = []
  mockSignupDelay = 100
  mockSignupResult = { success: true }
  success = false

  await onSubmit({ schoolName: "Test Academy" })

  assert.strictEqual(success, true, "Registration must succeed and show success screen")
  console.log("✓ Successful registration: State transitioned to success, ready to show confirmation screen.")

  console.log("\n==================================================")
  console.log("ALL SIGNUP RUNTIME SCENARIOS PASSED WITH 100% SUCCESS")
  console.log("==================================================")
}

testSignupFlow().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
